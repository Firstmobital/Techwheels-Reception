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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMobileNumbers(raw) {
  return raw
    .split(/[\n,;\s]+/)
    .map((s) => s.replace(/\D/g, '').slice(0, 10))
    .filter((s) => /^\d{10}$/.test(s));
}

function deduplicateNumbers(numbers) {
  return [...new Set(numbers)];
}

function getDisplayName(person) {
  const first = person?.first_name?.trim() || '';
  const last = person?.last_name?.trim() || '';
  return `${first} ${last}`.trim() || 'Unnamed advisor';
}

function getDateRange(filter) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === 'today') {
    return { start: startOfDay, end: new Date(startOfDay.getTime() + 86400000) };
  }
  if (filter === 'week') {
    const day = startOfDay.getDay();
    const monday = new Date(startOfDay);
    monday.setDate(startOfDay.getDate() - ((day + 6) % 7));
    return { start: monday, end: new Date(monday.getTime() + 7 * 86400000) };
  }
  if (filter === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return null; // all time — no date filter
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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

// ─── All Entries service calls ────────────────────────────────────────────────

async function fetchIVREntries(dateFilter) {
  let query = supabase
    .from(AI_LEADS_TABLE)
    .select('id, customer_name, mobile_number, model_name, salesperson_id, location_id, remarks, lead_source, opty_status, lead_disposition, created_at, updated_at')
    .eq('lead_source', 'IVR')
    .order('created_at', { ascending: false });

  const range = getDateRange(dateFilter);
  if (range) {
    query = query
      .gte('created_at', range.start.toISOString())
      .lt('created_at', range.end.toISOString());
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
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Inline Edit Row (All Entries tab) ───────────────────────────────────────

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

  if (editing) {
    return (
      <tr className="bg-blue-50 border-b border-blue-100">
        <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
        <td className="px-3 py-2">
          <input autoFocus type="text"
            className="kiosk-input !min-h-[34px] !py-1 !text-sm w-full"
            value={draft.customer_name} placeholder="Customer name"
            onChange={(e) => setD('customer_name', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
          />
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
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          />
        </td>
        <td className="px-3 py-2">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span>
        </td>
        <td className="px-3 py-2">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">
            {normalizeLeadSource(entry.lead_source)}
          </span>
        </td>
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
      <td className="px-3 py-2.5 text-sm text-slate-800">{entry.customer_name || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700 font-mono">{entry.mobile_number}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.model_name || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.location_name}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.salesperson_name}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[160px] truncate" title={entry.remarks || ''}>
        {entry.remarks || <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">
          {normalizeLeadSource(entry.lead_source)}
        </span>
      </td>
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
    try {
      setEntries(await fetchIVREntries(dateFilter));
    } catch (err) {
      setLoadError(err?.message || 'Failed to load entries.');
    } finally {
      setLoading(false);
    }
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
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {DATE_FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => setDateFilter(f.value)}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                dateFilter === f.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text"
            className="kiosk-input !min-h-[36px] !py-1.5 !text-sm w-52"
            placeholder="Search name, mobile, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400 text-sm">
          No entries found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="walkin-table !mt-0 min-w-[1000px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">Date &amp; Time</th>
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
  const [data, setData] = useState(BLANK_ROW_DATA);
  const [salespersons, setSalespersons] = useState([]);
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
      setSalespersons([]);
      setData((prev) => ({ ...prev, salespersonId: '' }));
      return;
    }
    setLoadingSP(true);
    getSalesPersonsByLocation(data.locationId)
      .then((res) => { if (mounted) { setSalespersons(res || []); setData((prev) => ({ ...prev, salespersonId: '' })); } })
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
          <td colSpan={5} className="px-4 py-3">
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
                  disabled={!data.locationId || loadingSP}>
                  <option value="">{!data.locationId ? 'Select branch first' : loadingSP ? 'Loading…' : 'Select advisor'}</option>
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

  const [rawInput, setRawInput] = useState('');
  const [importError, setImportError] = useState('');
  const [rows, setRows] = useState([]);
  const [hasImported, setHasImported] = useState(false);

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

  const handleImport = () => {
    setImportError('');
    const numbers = deduplicateNumbers(parseMobileNumbers(rawInput));
    if (numbers.length === 0) {
      setImportError('No valid 10-digit mobile numbers found. Please check your input.');
      return;
    }
    const newRows = numbers.map((mobile, index) => ({
      id: `${mobile}-${index}`,
      index,
      mobile,
      status: STATUS.PENDING,
      savedSummary: null,
      errorMessage: null,
    }));
    setRows(newRows);
    setHasImported(true);
    setTimeout(() => {
      const firstId = newRows[0]?.id;
      if (firstId) interestedBtnRefs.current[firstId]?.focus();
    }, 100);
  };

  const handleReset = () => {
    setRows([]);
    setRawInput('');
    setHasImported(false);
    setImportError('');
    interestedBtnRefs.current = {};
  };

  const setRowStatus = useCallback((rowId, status, extra = {}) => {
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, status, ...extra } : r));
  }, []);

  const focusNextPendingRow = useCallback((afterRowId) => {
    setRows((currentRows) => {
      const afterIndex = currentRows.findIndex((r) => r.id === afterRowId);
      const nextPending = currentRows.find((r, i) => i > afterIndex && r.status === STATUS.PENDING);
      if (nextPending) {
        setTimeout(() => interestedBtnRefs.current[nextPending.id]?.focus(), 60);
      }
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

  return (
    <section className="kiosk-card mx-auto w-full rounded-2xl p-6 shadow-lg" style={{ maxWidth: '1100px' }}>
      <h1 className="kiosk-title !mb-1 text-4xl">IVR Lead Entry</h1>
      <p className="mb-5 text-base text-slate-600">
        Paste mobile numbers, then mark each as Interested or Uninterested.
      </p>

      {/* Tab toggle */}
      <div className="mb-6 flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
        {[
          { id: 'entry', label: '+ New Entry' },
          { id: 'all', label: 'All Entries' },
        ].map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Entry Tab ── */}
      {activeTab === 'entry' && (
        !hasImported ? (
          <div className="space-y-4">
            <label className="block text-lg font-semibold text-slate-700">
              Paste Mobile Numbers
              <p className="mt-0.5 text-sm font-normal text-slate-500">
                One per line, or separated by commas or spaces. Duplicates removed automatically.
              </p>
              <textarea
                className="kiosk-input mt-2 min-h-[200px] font-mono text-base"
                placeholder={"9876543210\n9123456789\n9000000001"}
                value={rawInput}
                onChange={(e) => { setRawInput(e.target.value); setImportError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    if (rawInput.trim()) handleImport();
                  }
                }}
              />
            </label>
            {importError && <p className="error-text">{importError}</p>}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">Ctrl+Enter</kbd> to import
              </p>
              <button type="button" className="btn btn-primary px-8 h-14 rounded-2xl text-lg"
                onClick={handleImport} disabled={!rawInput.trim()}>
                Import Numbers
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> · next field</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd> · move forward</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">↑ ↓</kbd> · dropdown</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">U</kbd> · Uninterested</span>
              <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> on Remarks · Save &amp; next</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 font-semibold">Total: {rows.length}</span>
                <span className="px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 font-semibold">Pending: {counts.pending}</span>
                <span className="px-3 py-1.5 rounded-xl bg-green-50 text-green-700 font-semibold">Saved: {counts.saved}</span>
                <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 font-semibold">Uninterested: {counts.uninterested}</span>
              </div>
              <button type="button"
                className="btn border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 text-sm px-4 h-10 rounded-xl"
                onClick={handleReset}>
                ← New Import
              </button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="walkin-table !mt-0">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-8">#</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Mobile</th>
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