import { useEffect, useState, useCallback, useRef } from 'react';
import { createIVRLead } from '../../services/ivrService';
import {
  getAvailableCars,
  getLocations,
  getSalesPersonsByLocation
} from '../../services/walkinService';
import { supabase } from '../../services/supabaseClient';

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_LEADS_TABLE = 'ai_leads';
const EMPLOYEES_TABLE = 'employees';
const LOCATIONS_TABLE = 'locations';

const STATUS = {
  PENDING: 'pending',
  SAVING: 'saving',
  SAVED: 'saved',
  UNINTERESTED: 'uninterested',
  ERROR: 'error',
};

const DATE_FILTERS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

const BLANK_ROW_DATA = {
  customerName: '',
  modelName: '',
  locationId: '',
  salespersonId: '',
  remarks: '',
};

// ─── CSV / number helpers ─────────────────────────────────────────────────────

/**
 * Converts any phone number representation to a clean 10-digit string.
 * Handles:
 *   - Scientific notation:  7.877623012e+09  → '7877623012'
 *   - +91 prefix:           +919216026772    → '9216026772'
 *   - Plain 10-digit:       9876543210       → '9876543210'
 * Returns null if not a valid 10-digit number.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const str = String(raw).trim();

  // Handle scientific notation (e.g. 7.877623012e+09)
  let digits;
  if (/e\+/i.test(str)) {
    const n = Math.round(parseFloat(str));
    if (isNaN(n)) return null;
    digits = String(n);
  } else {
    digits = str.replace(/\D/g, '');
  }

  // Strip leading country code: 91XXXXXXXXXX → XXXXXXXXXX
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return /^\d{10}$/.test(digits) ? digits : null;
}

/**
 * Parse CSV text into an array of objects using the first row as headers.
 * Handles quoted fields and trims whitespace from headers.
 */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map((line) => {
    // Simple CSV split — handles quoted commas
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());

    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

/**
 * Parse an uploaded File (CSV or Excel-saved-as-CSV).
 * Returns array of { mobile, callDate, connectedToRaw }.
 * Deduplicates by mobile number (keeps first occurrence).
 */
function parseIVRFile(csvText) {
  const rows = parseCSV(csvText);
  const seen = new Set();
  const results = [];

  for (const row of rows) {
    // Support both exact and case-insensitive column names
    const getCol = (name) => {
      const key = Object.keys(row).find(
        (k) => k.toLowerCase().replace(/\s+/g, '') === name.toLowerCase().replace(/\s+/g, '')
      );
      return key ? row[key] : '';
    };

    const mobile = normalizePhone(getCol('CustomerNumber'));
    if (!mobile || seen.has(mobile)) continue;
    seen.add(mobile);

    // CallDate — expect YYYY-MM-DD
    const rawDate = getCol('CallDate')?.trim();
    const callDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

    // ConnectedTo — the salesperson's phone number
    const connectedToRaw = getCol('ConnectedTo')?.trim() || null;

    results.push({ mobile, callDate, connectedToRaw });
  }

  return results;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getDisplayName(person) {
  if (!person) return null;
  const first = person.first_name?.trim() || '';
  const last = person.last_name?.trim() || '';
  return `${first} ${last}`.trim() || null;
}

function getDateRange(filter) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === 'today') return { start: startOfDay, end: new Date(startOfDay.getTime() + 86400000) };
  if (filter === 'week') {
    const monday = new Date(startOfDay);
    monday.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
    return { start: monday, end: new Date(monday.getTime() + 7 * 86400000) };
  }
  if (filter === 'month') return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
  return null;
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCallDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizeLeadSource(src) {
  return String(src || '').trim().toUpperCase() === 'IVR' ? 'IVR' : 'Chatbot';
}

function normalizeOptyStatus(entry) {
  if (entry.lead_disposition === 'uninterested') return { label: 'Uninterested', color: 'bg-red-100 text-red-600' };
  const s = String(entry.opty_status || '').trim().toLowerCase();
  if (s === 'submitted') return { label: 'Submitted', color: 'bg-indigo-100 text-indigo-700' };
  return { label: 'Pending', color: 'bg-orange-100 text-orange-600' };
}

// ─── All Entries service ──────────────────────────────────────────────────────

async function fetchIVREntries(dateFilter) {
  let query = supabase
    .from(AI_LEADS_TABLE)
    .select('id, customer_name, mobile_number, model_name, salesperson_id, location_id, remarks, lead_source, opty_status, lead_disposition, call_datetime, created_at, updated_at')
    .eq('lead_source', 'IVR')
    .order('created_at', { ascending: false })
    .range(0, 9999);

  const range = getDateRange(dateFilter);
  if (range) {
    query = query.gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];

  const salespersonIds = [...new Set(rows.map((r) => r.salesperson_id).filter(Boolean))];
  const locationIds = [...new Set(rows.map((r) => r.location_id).filter(Boolean))];

  const [empResult, locResult] = await Promise.all([
    salespersonIds.length
      ? supabase.from(EMPLOYEES_TABLE).select('id, first_name, last_name').in('id', salespersonIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from(LOCATIONS_TABLE).select('id, name').in('id', locationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (empResult.error) throw empResult.error;
  if (locResult.error) throw locResult.error;

  const empById = new Map((empResult.data || []).map((e) => [e.id, e]));
  const locById = new Map((locResult.data || []).map((l) => [l.id, l]));

  return rows.map((row) => ({
    ...row,
    salesperson_name: row.salesperson_id ? (getDisplayName(empById.get(row.salesperson_id)) || '—') : '—',
    location_name: row.location_id ? (locById.get(row.location_id)?.name || '—') : '—',
  }));
}

async function updateIVREntry(id, payload) {
  const { data, error } = await supabase
    .from(AI_LEADS_TABLE)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Employee lookup by mobile ────────────────────────────────────────────────

/**
 * Given an array of raw ConnectedTo values (e.g. '+919216026772'),
 * queries the employees table by mobile and returns a Map of
 * normalizedPhone → employee row.
 */
async function fetchEmployeesByMobile(rawPhones) {
  const normalized = [...new Set(rawPhones.map(normalizePhone).filter(Boolean))];
  if (!normalized.length) return new Map();

  // employees.mobile may be stored as 10-digit or with +91
  // Query both forms to be safe
  const withCountryCode = normalized.map((m) => `+91${m}`);
  const allVariants = [...normalized, ...withCountryCode];

  const { data, error } = await supabase
    .from(EMPLOYEES_TABLE)
    .select('id, first_name, last_name, mobile, location_id')
    .in('mobile', allVariants);

  if (error) throw error;

  const map = new Map();
  for (const emp of data || []) {
    const normalized10 = normalizePhone(emp.mobile);
    if (normalized10) map.set(normalized10, emp);
  }
  return map;
}

// ─── Inline Edit Row (All Entries) ───────────────────────────────────────────

function AllEntriesRow({ entry, cars, locations, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [salespersons, setSalespersons] = useState([]);
  const [loadingSP, setLoadingSP] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');

  const setD = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    if (!editing || !draft.location_id) { setSalespersons([]); return; }
    let mounted = true;
    setLoadingSP(true);
    getSalesPersonsByLocation(draft.location_id)
      .then((res) => { if (mounted) setSalespersons(res || []); })
      .catch(() => { if (mounted) setSalespersons([]); })
      .finally(() => { if (mounted) setLoadingSP(false); });
    return () => { mounted = false; };
  }, [draft.location_id, editing]);

  const handleEdit = () => {
    setDraft({
      customer_name: entry.customer_name || '',
      model_name: entry.model_name || '',
      location_id: entry.location_id || '',
      salesperson_id: entry.salesperson_id || '',
      remarks: entry.remarks || '',
    });
    setRowError('');
    setEditing(true);
  };

  const handleCancel = () => { setEditing(false); setRowError(''); };

  const handleSave = async () => {
    setSaving(true);
    setRowError('');
    try {
      await updateIVREntry(entry.id, {
        customer_name: draft.customer_name?.trim() || null,
        model_name: draft.model_name || null,
        location_id: draft.location_id || null,
        salesperson_id: draft.salesperson_id || null,
        remarks: draft.remarks?.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setRowError(err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const { label: statusLabel, color: statusColor } = normalizeOptyStatus(entry);
  const callDateDisplay = formatCallDate(entry.call_datetime);

  if (editing) {
    return (
      <tr className="bg-blue-50 border-b border-blue-100">
        <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{callDateDisplay || <span className="text-slate-300">—</span>}</td>
        <td className="px-3 py-2">
          <input autoFocus type="text" className="kiosk-input !min-h-[34px] !py-1 !text-sm w-full"
            value={draft.customer_name} placeholder="Customer name"
            onChange={(e) => setD('customer_name', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }} />
        </td>
        <td className="px-3 py-2 text-sm text-slate-700 font-mono">{entry.mobile_number}</td>
        <td className="px-3 py-2">
          <select className="kiosk-select !min-h-[34px] !py-1 !text-sm w-full"
            value={draft.model_name} onChange={(e) => setD('model_name', e.target.value)}>
            <option value="">— Model —</option>
            {cars.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <select className="kiosk-select !min-h-[34px] !py-1 !text-sm w-full"
            value={draft.location_id} onChange={(e) => setD('location_id', e.target.value)}>
            <option value="">— Branch —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <select className="kiosk-select !min-h-[34px] !py-1 !text-sm w-full"
            value={draft.salesperson_id} onChange={(e) => setD('salesperson_id', e.target.value)}
            disabled={!draft.location_id || loadingSP}>
            <option value="">{!draft.location_id ? 'Select branch first' : '— Advisor —'}</option>
            {salespersons.map((sp) => <option key={sp.id} value={sp.id}>{getDisplayName(sp)}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <input type="text" className="kiosk-input !min-h-[34px] !py-1 !text-sm w-full"
            value={draft.remarks} placeholder="Remarks"
            onChange={(e) => setD('remarks', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }} />
        </td>
        <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span></td>
        <td className="px-3 py-2"><span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">{normalizeLeadSource(entry.lead_source)}</span></td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={handleSave} disabled={saving}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={handleCancel}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50">
              Cancel
            </button>
          </div>
          {rowError && <p className="text-[10px] text-red-600 mt-1 text-right">{rowError}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap font-medium">{callDateDisplay || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2.5 text-sm text-slate-800">{entry.customer_name || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700 font-mono">{entry.mobile_number}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.model_name || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.location_name}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.salesperson_name}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[160px] truncate" title={entry.remarks || ''}>
        {entry.remarks || <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2.5"><span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span></td>
      <td className="px-3 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">{normalizeLeadSource(entry.lead_source)}</span></td>
      <td className="px-3 py-2.5 text-right">
        <button type="button" onClick={handleEdit}
          className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-100 font-semibold">
          Edit
        </button>
      </td>
    </tr>
  );
}

// ─── All Entries Tab ──────────────────────────────────────────────────────────

function AllEntriesTab({ cars, locations }) {
  const [dateFilter, setDateFilter] = useState('today');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try { setEntries(await fetchIVREntries(dateFilter)); }
    catch (err) { setLoadError(err?.message || 'Failed to load entries.'); }
    finally { setLoading(false); }
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (e.customer_name || '').toLowerCase().includes(q) ||
      (e.mobile_number || '').includes(q) ||
      (e.model_name || '').toLowerCase().includes(q) ||
      (e.location_name || '').toLowerCase().includes(q) ||
      (e.salesperson_name || '').toLowerCase().includes(q) ||
      (e.remarks || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {DATE_FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => setDateFilter(f.value)}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${dateFilter === f.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text" className="kiosk-input !min-h-[36px] !py-1.5 !text-sm w-52"
            placeholder="Search name, mobile, model…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <button type="button" onClick={load} disabled={loading}
            className="text-[11px] px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 font-semibold">
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-400 font-medium">
        {loading ? 'Loading…' : `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`}
        {search && entries.length !== filtered.length ? ` (filtered from ${entries.length})` : ''}
      </div>

      {loadError && <p className="error-text">{loadError}</p>}

      {!loading && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400 text-sm">No entries found</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="walkin-table !mt-0 min-w-[1100px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">Entry Date</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">Call Date</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Customer Name</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Mobile</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Model</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Branch</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Sales Advisor</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Remarks</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Status</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Source</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <AllEntriesRow key={entry.id} entry={entry} cars={cars} locations={locations} onSaved={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Entry Tab IVR Row ────────────────────────────────────────────────────────

function IVRRow({
  row, cars, locations, loadingCars, loadingLocations,
  onMarkUninterested, onSaveInterested, onFocusNext, interestedBtnRef,
}) {
  const [data, setData] = useState(() => ({
    ...BLANK_ROW_DATA,
    // Pre-fill salesperson if matched from CSV
    salespersonId: row.matchedSalespersonId || '',
    locationId: row.matchedLocationId || '',
  }));
  const [salespersons, setSalespersons] = useState(
    // Pre-populate with matched salesperson so it shows in the dropdown
    row.matchedSalesperson ? [row.matchedSalesperson] : []
  );
  const [loadingSP, setLoadingSP] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const customerNameRef = useRef(null);
  const modelRef = useRef(null);
  const branchRef = useRef(null);
  const advisorRef = useRef(null);
  const remarksRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    if (!data.locationId) {
      setSalespersons(row.matchedSalesperson ? [row.matchedSalesperson] : []);
      return;
    }
    setLoadingSP(true);
    getSalesPersonsByLocation(data.locationId)
      .then((res) => { if (mounted) { setSalespersons(res || []); } })
      .catch(() => { if (mounted) setSalespersons([]); })
      .finally(() => { if (mounted) setLoadingSP(false); });
    return () => { mounted = false; };
  }, [data.locationId]);

  const set = (field, value) => setData((prev) => ({ ...prev, [field]: value }));
  const isDone = row.status === STATUS.SAVED || row.status === STATUS.UNINTERESTED;
  const isSaving = row.status === STATUS.SAVING;

  const rowBg =
    row.status === STATUS.SAVED ? 'bg-green-50' :
    row.status === STATUS.UNINTERESTED ? 'bg-red-50 opacity-60' :
    row.status === STATUS.ERROR ? 'bg-yellow-50' : 'bg-white';

  const handleSave = useCallback(async () => {
    await onSaveInterested(row.id, data);
    onFocusNext();
  }, [row.id, data, onSaveInterested, onFocusNext]);

  const handleRowKeyDown = useCallback((e) => {
    if (isDone || isSaving) return;
    if ((e.key === 'u' || e.key === 'U') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      onMarkUninterested(row.id);
      onFocusNext();
    }
  }, [isDone, isSaving, onMarkUninterested, onFocusNext, row.id]);

  const chainEnter = (e, nextRef) => {
    if (e.key === 'Enter') { e.preventDefault(); nextRef?.current?.focus(); }
  };

  const handleRemarksKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
  }, [handleSave]);

  return (
    <tbody>
      <tr className={`border-b border-slate-100 transition-colors ${rowBg}`} onKeyDown={handleRowKeyDown}>
        <td className="px-3 py-2 text-xs text-slate-400 font-mono w-8">{row.index + 1}</td>
        <td className="px-3 py-2 text-sm font-semibold text-slate-800 w-36">{row.mobile}</td>
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap w-28">
          {row.callDate || <span className="text-slate-300">—</span>}
        </td>
        {/* Salesperson match indicator */}
        <td className="px-3 py-2 text-xs w-36">
          {row.matchedSalesperson ? (
            <span className="text-emerald-700 font-medium">
              ✓ {getDisplayName(row.matchedSalesperson)}
            </span>
          ) : (
            <span className="text-slate-300">No match</span>
          )}
        </td>
        <td className="px-3 py-2 w-28">
          {row.status === STATUS.SAVED && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">✓ Saved</span>}
          {row.status === STATUS.UNINTERESTED && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Uninterested</span>}
          {row.status === STATUS.ERROR && <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">Error</span>}
          {row.status === STATUS.PENDING && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Pending</span>}
          {row.status === STATUS.SAVING && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 animate-pulse">Saving…</span>}
        </td>
        <td className="px-3 py-2 text-xs text-slate-500">
          {row.status === STATUS.SAVED && row.savedSummary ? <span>{row.savedSummary}</span>
            : row.status === STATUS.ERROR ? <span className="text-yellow-700">{row.errorMessage}</span>
            : null}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {!isDone && (
            <div className="flex items-center justify-end gap-1.5">
              {!expanded ? (
                <button ref={interestedBtnRef} type="button"
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  onClick={() => { setExpanded(true); setTimeout(() => customerNameRef.current?.focus(), 50); }}
                  disabled={isSaving} title="Enter/Space · U = Uninterested">
                  Interested
                </button>
              ) : (
                <button type="button"
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              )}
              <button type="button"
                className="text-[11px] px-2.5 py-1 rounded-lg border border-red-200 text-red-600 bg-white font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                onClick={() => { onMarkUninterested(row.id); onFocusNext(); }}
                disabled={isSaving} title="U key shortcut">
                Uninterested
              </button>
              {expanded && (
                <button type="button" className="text-[11px] text-slate-400 underline ml-0.5"
                  onClick={() => setExpanded(false)}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </td>
      </tr>

      {expanded && !isDone && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={7} className="px-4 py-3">
            <p className="text-[11px] text-slate-400 mb-2.5">
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Enter</kbd> next &nbsp;·&nbsp;
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">↑↓</kbd> dropdown &nbsp;·&nbsp;
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Enter</kbd> on Remarks saves &nbsp;·&nbsp;
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">U</kbd> Uninterested
            </p>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Customer Name
                <input ref={customerNameRef} type="text" className="kiosk-input !min-h-[36px] !py-1.5 !text-sm"
                  placeholder="Optional" value={data.customerName}
                  onChange={(e) => set('customerName', e.target.value)}
                  onKeyDown={(e) => chainEnter(e, modelRef)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Model
                <select ref={modelRef} className="kiosk-select !min-h-[36px] !py-1.5 !text-sm"
                  value={data.modelName} onChange={(e) => set('modelName', e.target.value)} disabled={loadingCars}>
                  <option value="">{loadingCars ? 'Loading…' : 'Optional'}</option>
                  {cars.map((car) => <option key={car.id} value={car.name}>{car.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Branch <span className="font-normal text-slate-400">(optional)</span>
                <select ref={branchRef} className="kiosk-select !min-h-[36px] !py-1.5 !text-sm"
                  value={data.locationId} onChange={(e) => set('locationId', e.target.value)} disabled={loadingLocations}>
                  <option value="">{loadingLocations ? 'Loading…' : 'Select branch'}</option>
                  {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name || `Branch #${loc.id}`}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Sales Advisor <span className="font-normal text-slate-400">(optional)</span>
                <select ref={advisorRef} className="kiosk-select !min-h-[36px] !py-1.5 !text-sm"
                  value={data.salespersonId} onChange={(e) => set('salespersonId', e.target.value)}
                  disabled={loadingSP}>
                  <option value="">{loadingSP ? 'Loading…' : 'Select advisor'}</option>
                  {salespersons.map((sp) => <option key={sp.id} value={sp.id}>{getDisplayName(sp)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
                Remarks
                <input ref={remarksRef} type="text" className="kiosk-input !min-h-[36px] !py-1.5 !text-sm"
                  placeholder="Optional · Enter to save" value={data.remarks}
                  onChange={(e) => set('remarks', e.target.value)}
                  onKeyDown={handleRemarksKeyDown} />
              </label>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function IVREntryScreen() {
  const [activeTab, setActiveTab] = useState('entry');

  // File upload state
  const [fileError, setFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Table state
  const [rows, setRows] = useState([]);
  const [hasImported, setHasImported] = useState(false);

  // Shared lookup data
  const [cars, setCars] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);

  const interestedBtnRefs = useRef({});

  useEffect(() => {
    let mounted = true;
    getAvailableCars()
      .then((data) => { if (mounted) setCars((data || []).filter((c) => c?.name?.trim())); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoadingCars(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    getLocations()
      .then((data) => { if (mounted) setLocations(data || []); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoadingLocations(false); });
    return () => { mounted = false; };
  }, []);

  // ── File upload handler ──────────────────────────────────────────────────────

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isZip = file.name.endsWith('.zip');
    const isCsv = file.name.endsWith('.csv');

    if (!isZip && !isCsv) {
      setFileError('Please upload the ZIP file downloaded from your IVR portal, or a CSV file.');
      e.target.value = '';
      return;
    }

    setFileError('');
    setImporting(true);

    try {
      let text;

      if (isZip) {
        // Dynamically load JSZip from CDN on first use
        if (!window.JSZip) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load ZIP library. Check your internet connection.'));
            document.head.appendChild(script);
          });
        }

        const arrayBuffer = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(arrayBuffer);

        // Find the first CSV file inside the zip
        const csvFile = Object.values(zip.files).find(
          (f) => !f.dir && f.name.toLowerCase().endsWith('.csv')
        );

        if (!csvFile) {
          setFileError('No CSV file found inside the ZIP. Please check the downloaded file.');
          setImporting(false);
          e.target.value = '';
          return;
        }

        text = await csvFile.async('text');
      } else {
        text = await file.text();
      }
      const parsed = parseIVRFile(text);

      if (parsed.length === 0) {
        setFileError('No valid customer numbers found. Make sure the file has a CustomerNumber column.');
        setImporting(false);
        e.target.value = '';
        return;
      }

      // Look up salespeople by ConnectedTo phone numbers
      const connectedPhones = parsed.map((r) => r.connectedToRaw).filter(Boolean);
      const empByMobile = await fetchEmployeesByMobile(connectedPhones);

      const newRows = parsed.map(({ mobile, callDate, connectedToRaw }, index) => {
        const connectedNormalized = normalizePhone(connectedToRaw);
        const matchedSalesperson = connectedNormalized ? empByMobile.get(connectedNormalized) || null : null;

        return {
          id: `${mobile}-${index}`,
          index,
          mobile,
          callDate,
          connectedToRaw,
          matchedSalesperson,
          matchedSalespersonId: matchedSalesperson?.id ? String(matchedSalesperson.id) : '',
          matchedLocationId: matchedSalesperson?.location_id ? String(matchedSalesperson.location_id) : '',
          status: STATUS.PENDING,
          savedSummary: null,
          errorMessage: null,
        };
      });

      setRows(newRows);
      setHasImported(true);

      setTimeout(() => {
        const firstId = newRows[0]?.id;
        if (firstId) interestedBtnRefs.current[firstId]?.focus();
      }, 100);

    } catch (err) {
      setFileError(err?.message || 'Failed to parse file.');
    } finally {
      setImporting(false);
      e.target.value = ''; // reset so same file can be re-uploaded
    }
  };

  const handleReset = () => {
    setRows([]);
    setHasImported(false);
    setFileError('');
    interestedBtnRefs.current = {};
  };

  // ── Row actions ──────────────────────────────────────────────────────────────

  const setRowStatus = useCallback((rowId, status, extra = {}) => {
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, status, ...extra } : r));
  }, []);

  const focusNextPendingRow = useCallback((afterRowId) => {
    setRows((currentRows) => {
      const afterIndex = currentRows.findIndex((r) => r.id === afterRowId);
      const nextPending = currentRows.find((r, i) => i > afterIndex && r.status === STATUS.PENDING);
      if (nextPending) setTimeout(() => interestedBtnRefs.current[nextPending.id]?.focus(), 60);
      return currentRows;
    });
  }, []);

  const handleMarkUninterested = useCallback((rowId) => {
    setRowStatus(rowId, STATUS.UNINTERESTED);
  }, [setRowStatus]);

  const handleSaveInterested = useCallback(async (rowId, data) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    setRowStatus(rowId, STATUS.SAVING);
    try {
      await createIVRLead({
        customer_name: data.customerName.trim() || null,
        mobile_number: row.mobile,
        model_name: data.modelName || null,
        salesperson_id: data.salespersonId || null,
        location_id: data.locationId || null,
        remarks: data.remarks.trim() || null,
        call_datetime: row.callDate ? new Date(row.callDate).toISOString() : null,
      });
      const parts = [];
      if (data.customerName.trim()) parts.push(data.customerName.trim());
      if (data.modelName) parts.push(data.modelName);
      if (data.remarks.trim()) parts.push(`"${data.remarks.trim()}"`);
      setRowStatus(rowId, STATUS.SAVED, { savedSummary: parts.join(' · ') || 'Saved to AI queue' });
    } catch (error) {
      setRowStatus(rowId, STATUS.ERROR, { errorMessage: error?.message || 'Save failed.' });
    }
  }, [rows, setRowStatus]);

  const counts = rows.reduce(
    (acc, r) => {
      if (r.status === STATUS.SAVED) acc.saved++;
      else if (r.status === STATUS.UNINTERESTED) acc.uninterested++;
      else acc.pending++;
      return acc;
    },
    { saved: 0, uninterested: 0, pending: 0 }
  );

  const matchedCount = rows.filter((r) => r.matchedSalesperson).length;

  return (
    <section className="kiosk-card mx-auto w-full rounded-2xl p-6 shadow-lg" style={{ maxWidth: '1150px' }}>
      <h1 className="kiosk-title !mb-1 text-4xl">IVR Lead Entry</h1>
      <p className="mb-5 text-base text-slate-600">
        Upload your IVR call report CSV. Sales advisors are matched automatically from <code className="bg-slate-100 rounded px-1 text-sm">ConnectedTo</code>.
      </p>

      {/* Tab toggle */}
      <div className="mb-6 flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
        {[{ id: 'entry', label: '+ New Entry' }, { id: 'all', label: 'All Entries' }].map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Entry Tab ── */}
      {activeTab === 'entry' && (
        !hasImported ? (
          <div className="space-y-5">
            {/* Upload area */}
            <div
              className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileInputRef.current.files = dt.files;
                  handleFileChange({ target: fileInputRef.current });
                }
              }}
            >
              <div className="text-4xl mb-3">📂</div>
              <p className="text-lg font-semibold text-slate-700 mb-1">
                {importing ? 'Processing file…' : 'Upload IVR Call Report (ZIP or CSV)'}
              </p>
              <p className="text-sm text-slate-500 mb-4">
                Click to browse or drag &amp; drop your ZIP or CSV file here
              </p>
              <div className="inline-flex items-center gap-2 text-xs text-slate-400 bg-white rounded-xl border border-slate-200 px-4 py-2">
                <span>Required columns:</span>
                <code className="bg-slate-100 rounded px-1">CallDate</code>
                <code className="bg-slate-100 rounded px-1">CustomerNumber</code>
                <code className="bg-slate-100 rounded px-1">ConnectedTo</code>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {fileError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {fileError}
              </div>
            )}

            {/* Help note */}
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              Upload the <strong>ZIP file</strong> directly as downloaded from your IVR portal. CSV files are also accepted.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Keyboard legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> · next field</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd> · move forward</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">↑ ↓</kbd> · dropdown</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">U</kbd> · Uninterested</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> on Remarks · Save &amp; next</span>
            </div>

            {/* Summary bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 font-semibold">Total: {rows.length}</span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-semibold">Matched: {matchedCount}</span>
                <span className="px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 font-semibold">Pending: {counts.pending}</span>
                <span className="px-3 py-1.5 rounded-xl bg-green-50 text-green-700 font-semibold">Saved: {counts.saved}</span>
                <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 font-semibold">Uninterested: {counts.uninterested}</span>
              </div>
              <button type="button"
                className="btn border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 text-sm px-4 h-10 rounded-xl"
                onClick={handleReset}>
                ← Upload New File
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="walkin-table !mt-0">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-8">#</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Mobile</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Call Date</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Advisor Match</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Status</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Details</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                {rows.map((row) => (
                  <IVRRow
                    key={row.id}
                    row={row}
                    cars={cars}
                    locations={locations}
                    loadingCars={loadingCars}
                    loadingLocations={loadingLocations}
                    onMarkUninterested={handleMarkUninterested}
                    onSaveInterested={handleSaveInterested}
                    onFocusNext={() => focusNextPendingRow(row.id)}
                    interestedBtnRef={(el) => {
                      if (el) interestedBtnRefs.current[row.id] = el;
                      else delete interestedBtnRefs.current[row.id];
                    }}
                  />
                ))}
              </table>
            </div>
          </div>
        )
      )}

      {/* ── All Entries Tab ── */}
      {activeTab === 'all' && (
        <AllEntriesTab cars={cars} locations={locations} />
      )}
    </section>
  );
}