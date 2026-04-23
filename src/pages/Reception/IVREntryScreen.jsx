import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createIVRLead, createBatchDraftLeads, updateIVRLead, getLatestUploadedBatch } from '../../services/ivrService';
import {
  getAvailableCars,
  getLocations,
  getSalesPersonsByLocation
} from '../../services/walkinService';
import { supabase } from '../../services/supabaseClient';
/* ── Scoped styles for the IVR expanded-row UI ───────────────────────────── */
const IVR_ROW_STYLES = `
  .ivr-expand-wrap { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
  .ivr-expand-inner { padding:14px 16px 16px 16px; display:flex; flex-direction:column; gap:12px; }
  .ivr-audio-bar { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:8px 12px; display:flex; align-items:center; gap:10px; }
  .ivr-play-btn { width:28px; height:28px; border-radius:50%; background:#185FA5; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:background .15s; }
  .ivr-play-btn:hover { background:#0C447C; }
  .ivr-play-btn svg { display:block; }
  .ivr-waveform { flex:1; height:22px; display:flex; align-items:center; gap:1.5px; }
  .ivr-waveform span { display:block; border-radius:2px; width:3px; background:#B5D4F4; }
  .ivr-waveform span.ivr-wave-active { background:#378ADD; }
  .ivr-audio-dur { font-size:11px; color:#94a3b8; min-width:30px; text-align:right; }
  .ivr-transcript-btn { font-size:11px; font-weight:600; color:#7C3AED; background:#F5F3FF; border:1px solid #DDD6FE; border-radius:7px; padding:4px 10px; cursor:pointer; white-space:nowrap; transition:background .15s; display:flex; align-items:center; gap:4px; }
  .ivr-transcript-btn:hover { background:#EDE9FE; }
  .ivr-tx-status { font-size:10px; font-weight:600; padding:2px 7px; border-radius:99px; }
  .ivr-audio-date { font-size:11px; color:#94a3b8; margin-left:auto; }
  .ivr-ai-box { background:#EFF6FF; border:1px solid #BFDBFE; border-left:3px solid #3B82F6; border-radius:10px; padding:10px 12px; }
  .ivr-ai-box-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; }
  .ivr-ai-label { font-size:10px; font-weight:700; color:#2563EB; text-transform:uppercase; letter-spacing:.06em; }
  .ivr-ai-copy-btn { font-size:10px; font-weight:600; color:#2563EB; background:none; border:none; cursor:pointer; text-decoration:underline; padding:0; }
  .ivr-ai-copy-btn:hover { color:#1D4ED8; }
  .ivr-ai-text { font-size:12px; color:#1E3A8A; line-height:1.6; margin:0; }
  .ivr-fields-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
  @media (max-width:1100px) { .ivr-fields-grid { grid-template-columns:repeat(3,1fr); } }
  @media (max-width:700px) { .ivr-fields-grid { grid-template-columns:repeat(2,1fr); } }
  .ivr-field { display:flex; flex-direction:column; gap:4px; }
  .ivr-field-label { font-size:11px; font-weight:600; color:#475569; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
  .ivr-badge-ai { font-size:9px; font-weight:600; color:#15803D; background:#DCFCE7; padding:1px 5px; border-radius:99px; }
  .ivr-badge-match { font-size:9px; font-weight:600; color:#15803D; background:#DCFCE7; padding:1px 5px; border-radius:99px; }
  .ivr-select, .ivr-input { background:#fff; border:1px solid #CBD5E1; border-radius:7px; padding:6px 9px; font-size:13px; color:#1e293b; font-family:inherit; width:100%; min-height:34px; outline:none; transition:border-color .15s, box-shadow .15s; appearance:auto; }
  .ivr-select:focus, .ivr-input:focus { border-color:#3B82F6; box-shadow:0 0 0 3px rgba(59,130,246,.12); }
  .ivr-select:disabled, .ivr-input:disabled { background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
  .ivr-remarks-wrap { display:flex; flex-direction:column; gap:5px; }
  .ivr-remarks-header { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .ivr-remarks-title { font-size:11px; font-weight:600; color:#475569; }
  .ivr-badge-prefill { font-size:9px; font-weight:600; color:#2563EB; background:#EFF6FF; border:1px solid #BFDBFE; padding:1px 6px; border-radius:99px; }
  .ivr-badge-edited { font-size:9px; font-weight:600; color:#92400E; background:#FFFBEB; border:1px solid #FDE68A; padding:1px 6px; border-radius:99px; }
  .ivr-remarks-hint { font-size:10px; color:#94a3b8; margin-left:auto; }
  .ivr-textarea { background:#fff; border:1px solid #CBD5E1; border-radius:7px; padding:8px 10px; font-size:13px; color:#1e293b; font-family:inherit; width:100%; min-height:72px; resize:vertical; outline:none; line-height:1.55; transition:border-color .15s, box-shadow .15s; }
  .ivr-textarea:focus { border-color:#3B82F6; box-shadow:0 0 0 3px rgba(59,130,246,.12); }
  .ivr-action-bar { display:flex; align-items:center; gap:8px; border-top:1px solid #e2e8f0; padding-top:10px; }
  .ivr-action-spacer { flex:1; }
  .ivr-action-hint { font-size:10px; color:#94a3b8; }
  .ivr-action-btn { font-size:11px; font-weight:600; border-radius:7px; padding:6px 10px; border:1px solid transparent; cursor:pointer; transition:background .15s, border-color .15s; }
  .ivr-action-btn:disabled { opacity:.55; cursor:not-allowed; }
  .ivr-action-btn-neutral { background:#fff; color:#475569; border-color:#cbd5e1; }
  .ivr-action-btn-neutral:hover:not(:disabled) { background:#f8fafc; }
  .ivr-action-btn-danger { background:#fff; color:#dc2626; border-color:#fecaca; }
  .ivr-action-btn-danger:hover:not(:disabled) { background:#fef2f2; }
  .ivr-action-btn-primary { background:#16a34a; color:#fff; }
  .ivr-action-btn-primary:hover:not(:disabled) { background:#15803d; }
`;

function IVRStyleInjector() {
  useEffect(() => {
    const id = 'ivr-row-styles';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = IVR_ROW_STYLES;
      document.head.appendChild(el);
    }
  }, []);
  return null;
}



const IVR_LEADS_TABLE = 'ivr_leads';
const EMPLOYEES_TABLE = 'employees';
const LOCATIONS_TABLE = 'locations';
const UPLOAD_BRANCH_REQUIRED_ERROR = 'Please select a branch before uploading.';

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
  fuelType: '',
  locationId: '',
  salespersonId: '',
  conversationSummary: '',
  remarks: '',
  transcript: '',
};

const FUEL_OPTIONS = [
  { code: 'PETROL', label: 'Petrol' },
  { code: 'DIESEL', label: 'Diesel' },
  { code: 'EV',     label: 'EV' },
  { code: 'CNG',    label: 'CNG' },
];

function normalizePhone(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  let digits;
  if (/e\+/i.test(str)) {
    const n = Math.round(parseFloat(str));
    if (isNaN(n)) return null;
    digits = String(n);
  } else {
    digits = str.replace(/\D/g, '');
  }
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
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

function parseIVRFile(csvText) {
  const rows = parseCSV(csvText);
  const seen = new Set();
  const results = [];
  for (const row of rows) {
    const getCol = (name) => {
      const key = Object.keys(row).find(
        k => k.toLowerCase().replace(/\s+/g, '') === name.toLowerCase().replace(/\s+/g, '')
      );
      return key ? row[key] : '';
    };
    const mobile = normalizePhone(getCol('CustomerNumber'));
    if (!mobile || seen.has(mobile)) continue;
    seen.add(mobile);
    const rawDate = getCol('CallDate')?.trim();
    const callDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    const connectedToRaw = getCol('ConnectedTo')?.trim() || null;
    const callRecordingUrl = getCol('CallRecording')?.trim() || null;
    results.push({ mobile, callDate, connectedToRaw, callRecordingUrl });
  }
  return results;
}

function getDisplayName(person) {
  if (!person) return null;
  const first = person.first_name?.trim() || '';
  const last = person.last_name?.trim() || '';
  return `${first} ${last}`.trim() || null;
}

function getBestSalespersonLabel(row) {
  const matchedName = getDisplayName(row?.matchedSalesperson);
  if (matchedName) return matchedName;

  const directLabel = String(
    row?.salesperson_name || row?.dbLead?.salesperson_name || ''
  ).trim();
  if (directLabel && directLabel !== '—') return directLabel;

  const salespersonId = row?.dbLead?.salesperson_id || row?.salesperson_id || row?.matchedSalespersonId;
  if (salespersonId) return `Advisor #${salespersonId}`;

  return null;
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

function normalizeTranscriptionStatus(entry) {
  const status = String(entry.transcription_status || '').trim().toLowerCase();
  if (status === 'processing') return { label: 'Processing', color: 'bg-blue-100 text-blue-700' };
  if (status === 'completed') return { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' };
  if (status === 'failed') return { label: 'Failed', color: 'bg-red-100 text-red-700' };
  return { label: 'Pending', color: 'bg-slate-100 text-slate-600' };
}

// ─── #8: Transcript modal (unchanged) ────────────────────────────────────────

function TranscriptModal({ transcript, onClose }) {
  if (!transcript) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Full Call Transcript</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-xl p-4 border border-slate-200">
          {transcript}
        </div>
      </div>
    </div>
  );
}

// ─── #8: Audio popover (replaces inline audio expansion) ─────────────────────

function AudioPopover({ recordingUrl, onClose }) {
  const [audioError, setAudioError] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Call Recording</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <audio controls autoPlay preload="auto" src={recordingUrl} className="w-full" onError={() => setAudioError(true)} />
        {audioError && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
            Playback blocked.{' '}
            <a href={recordingUrl} target="_blank" rel="noreferrer" className="underline font-medium">Open raw link ↗</a>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── #1: Details drawer ───────────────────────────────────────────────────────

function DetailsDrawer({ dbLead, recordingUrl, onClose }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAudio, setShowAudio] = useState(false);
  const hasAI = dbLead?.customer_name || dbLead?.model_name || dbLead?.fuel_type || dbLead?.conversation_summary;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Lead Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        {hasAI ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">AI Extracted</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Customer', value: dbLead?.customer_name },
                { label: 'Model', value: dbLead?.model_name },
                { label: 'Fuel', value: dbLead?.fuel_type ? FUEL_OPTIONS.find(f => f.code === dbLead.fuel_type)?.label || dbLead.fuel_type : null },
                { label: 'Remarks', value: dbLead?.remarks },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-slate-400 font-medium mb-0.5">{label}</p>
                  <p className="text-sm text-slate-800 font-medium">{value || <span className="text-slate-300 font-normal">—</span>}</p>
                </div>
              ))}
            </div>
            {dbLead?.conversation_summary && (
              <div className="bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
                <p className="text-[10px] text-blue-500 font-semibold mb-1">AI Summary</p>
                <p className="text-sm text-blue-900 leading-relaxed">{dbLead.conversation_summary}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 rounded-xl px-4 py-6 text-center text-slate-400 text-sm">No AI data extracted yet</div>
        )}
        <div className="flex gap-2 flex-wrap pt-1">
          {dbLead?.transcript && (
            <button type="button" onClick={() => setShowTranscript(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-semibold border border-purple-200 hover:bg-purple-100 transition-colors">
              📄 View Transcript
            </button>
          )}
          {recordingUrl && (
            <button type="button" onClick={() => setShowAudio(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 font-semibold border border-sky-200 hover:bg-sky-100 transition-colors">
              ▶ Play Recording
            </button>
          )}
        </div>
      </div>
      {showTranscript && <TranscriptModal transcript={dbLead?.transcript} onClose={() => setShowTranscript(false)} />}
      {showAudio && <AudioPopover recordingUrl={recordingUrl} onClose={() => setShowAudio(false)} />}
    </div>
  );
}

// ─── All Entries: Inline Edit Row ─────────────────────────────────────────────

async function fetchIVREntries(dateFilter) {
  let query = supabase
    .from(IVR_LEADS_TABLE)
    .select('id, customer_name, mobile_number, model_name, fuel_type, salesperson_id, location_id, remarks, conversation_summary, transcript, transcription_status, transcription_error, review_status, call_datetime, created_at, updated_at')
    .order('created_at', { ascending: false })
    .range(0, 9999);
  const range = getDateRange(dateFilter);
  if (range) query = query.gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString());
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const salespersonIds = [...new Set(rows.map(r => r.salesperson_id).filter(Boolean))];
  const locationIds = [...new Set(rows.map(r => r.location_id).filter(Boolean))];
  const [empResult, locResult] = await Promise.all([
    salespersonIds.length ? supabase.from(EMPLOYEES_TABLE).select('id, first_name, last_name').in('id', salespersonIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length ? supabase.from(LOCATIONS_TABLE).select('id, name').in('id', locationIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (empResult.error) throw empResult.error;
  if (locResult.error) throw locResult.error;
  const empById = new Map((empResult.data || []).map(e => [e.id, e]));
  const locById = new Map((locResult.data || []).map(l => [l.id, l]));
  return rows.map(row => ({
    ...row,
    salesperson_name: row.salesperson_id ? (getDisplayName(empById.get(row.salesperson_id)) || '—') : '—',
    location_name: row.location_id ? (locById.get(row.location_id)?.name || '—') : '—',
  }));
}

async function updateIVREntry(id, payload) {
  const { data, error } = await supabase.from(IVR_LEADS_TABLE).update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function markIVRLeadInterested(ivrLeadId, payload) {
  const basePayload = {
    customer_name: payload.customer_name,
    model_name: payload.model_name,
    fuel_type: payload.fuel_type,
    salesperson_id: payload.salesperson_id || null,
    location_id: payload.location_id || null,
    remarks: payload.remarks,
    conversation_summary: payload.conversation_summary,
    call_datetime: payload.call_datetime,
    review_status: 'interested',
    reviewed_at: new Date().toISOString(),
    opty_status: 'pending',
  };

  // greenform_requested is optional on ivr_leads in some DBs.
  try {
    return await updateIVREntry(ivrLeadId, {
      ...basePayload,
      greenform_requested: true,
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('greenform_requested') && message.includes('column')) {
      return updateIVREntry(ivrLeadId, basePayload);
    }
    throw error;
  }
}

async function fetchEmployeesByMobile(rawPhones) {
  const normalized = [...new Set(rawPhones.map(normalizePhone).filter(Boolean))];
  if (!normalized.length) return new Map();
  const withCountryCode = normalized.map(m => `+91${m}`);
  const allVariants = [...normalized, ...withCountryCode];
  const { data, error } = await supabase.from(EMPLOYEES_TABLE).select('id, first_name, last_name, mobile, location_id').in('mobile', allVariants);
  if (error) throw error;
  const map = new Map();
  for (const emp of data || []) {
    const n = normalizePhone(emp.mobile);
    if (n) map.set(n, emp);
  }
  return map;
}

async function checkDuplicatePhones(mobileNumbers) {
  if (!mobileNumbers.length) return new Map();
  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .select('mobile_number, created_at')
    .in('mobile_number', mobileNumbers)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.mobile_number)) {
      map.set(row.mobile_number, row.created_at);
    }
  }
  return map;
}

function AllEntriesRow({ entry, cars, locations, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [salespersons, setSalespersons] = useState([]);
  const [loadingSP, setLoadingSP] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const callDateDisplay = formatCallDate(entry.call_datetime);
  const { label: txLabel, color: txColor } = normalizeTranscriptionStatus(entry);
  const { label: statusLabel, color: statusColor } = normalizeOptyStatus(entry);
  const setD = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  useEffect(() => {
    if (!editing || !draft.location_id) { setSalespersons([]); return; }
    let mounted = true;
    setLoadingSP(true);
    getSalesPersonsByLocation(draft.location_id).then(res => { if (mounted) setSalespersons(res || []); }).catch(() => { if (mounted) setSalespersons([]); }).finally(() => { if (mounted) setLoadingSP(false); });
    return () => { mounted = false; };
  }, [draft.location_id, editing]);

  const handleEdit = () => {
    setDraft({
      customer_name: entry.customer_name || '',
      model_name: entry.model_name || '',
      fuel_type: entry.fuel_type || '',
      location_id: entry.location_id || '',
      salesperson_id: entry.salesperson_id || '',
      remarks: entry.remarks || ''
    });
    setRowError('');
    setEditing(true);
  };
  const handleCancel = () => { setEditing(false); setRowError(''); };
  const handleSave = async () => {
    setSaving(true); setRowError('');
    try {
      await updateIVREntry(entry.id, { customer_name: draft.customer_name?.trim() || null, model_name: draft.model_name || null, fuel_type: draft.fuel_type || null, location_id: draft.location_id || null, salesperson_id: draft.salesperson_id || null, remarks: draft.remarks?.trim() || null });
      setEditing(false); onSaved();
    } catch (err) { setRowError(err?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  if (editing) {
    return (
      <tr className="border-b border-slate-200 bg-blue-50/60">
        <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{callDateDisplay || '—'}</td>
        <td className="px-3 py-2"><input type="text" className="kiosk-input !min-h-[32px] !py-1 !text-sm w-full" placeholder="Name" value={draft.customer_name} onChange={e => setD('customer_name', e.target.value)} /></td>
        <td className="px-3 py-2 text-sm text-slate-700 font-mono">{entry.mobile_number}</td>
        <td className="px-3 py-2"><select className="kiosk-select !min-h-[32px] !py-1 !text-sm" value={draft.model_name} onChange={e => setD('model_name', e.target.value)}><option value="">Optional</option>{cars.map(car => <option key={car.id} value={car.name}>{car.name}</option>)}</select></td>
        <td className="px-3 py-2"><select className="kiosk-select !min-h-[32px] !py-1 !text-sm" value={draft.fuel_type} onChange={e => setD('fuel_type', e.target.value)}><option value="">Optional</option>{FUEL_OPTIONS.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}</select></td>
        <td className="px-3 py-2"><select className="kiosk-select !min-h-[32px] !py-1 !text-sm" value={draft.location_id} onChange={e => setD('location_id', e.target.value)}><option value="">Select branch</option>{locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name || `Branch #${loc.id}`}</option>)}</select></td>
        <td className="px-3 py-2"><select className="kiosk-select !min-h-[32px] !py-1 !text-sm" value={draft.salesperson_id} onChange={e => setD('salesperson_id', e.target.value)} disabled={loadingSP}><option value="">{loadingSP ? 'Loading…' : 'Select advisor'}</option>{salespersons.map(sp => <option key={sp.id} value={sp.id}>{getDisplayName(sp)}</option>)}</select></td>
        <td className="px-3 py-2"><input type="text" className="kiosk-input !min-h-[32px] !py-1 !text-sm w-full" placeholder="Remarks" value={draft.remarks} onChange={e => setD('remarks', e.target.value)} /></td>
        <td className="px-3 py-2 text-xs"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${txColor}`}>{txLabel}</span>{entry.transcript && <button type="button" onClick={() => setShowTranscript(true)} className="ml-1 text-blue-500 underline text-[10px]">Transcript</button>}</td>
        <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span></td>
        <td className="px-3 py-2"><span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">{normalizeLeadSource(entry.lead_source)}</span></td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={handleSave} disabled={saving} className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={handleCancel} className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50">Cancel</button>
          </div>
          {rowError && <p className="text-[10px] text-red-600 mt-1 text-right">{rowError}</p>}
        </td>
        {showTranscript && <TranscriptModal transcript={entry.transcript} onClose={() => setShowTranscript(false)} />}
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
      <td className="px-3 py-2.5">{entry.fuel_type ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{FUEL_OPTIONS.find(f => f.code === entry.fuel_type)?.label || entry.fuel_type}</span> : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.location_name}</td>
      <td className="px-3 py-2.5 text-sm text-slate-700">{entry.salesperson_name}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[160px] truncate" title={entry.remarks || ''}>{entry.remarks || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2.5 text-xs max-w-[180px]">
        <div className="flex flex-col gap-1">
          <span className={`w-fit text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${txColor}`}>{txLabel}</span>
          {entry.transcript ? (<><button type="button" onClick={() => setShowTranscript(true)} className="text-blue-500 underline hover:text-blue-700 text-left">View transcript</button>{showTranscript && <TranscriptModal transcript={entry.transcript} onClose={() => setShowTranscript(false)} />}</>) : <span className="text-slate-300">—</span>}
          {entry.conversation_summary && <span className="text-[10px] text-slate-400 truncate" title={entry.conversation_summary}>{entry.conversation_summary}</span>}
          {entry.transcription_status === 'failed' && entry.transcription_error && <span className="text-[10px] text-red-500 truncate" title={entry.transcription_error}>{entry.transcription_error}</span>}
        </div>
      </td>
      <td className="px-3 py-2.5"><span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span></td>
      <td className="px-3 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">{normalizeLeadSource(entry.lead_source)}</span></td>
      <td className="px-3 py-2.5 text-right"><button type="button" onClick={handleEdit} className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-100 font-semibold">Edit</button></td>
    </tr>
  );
}

function AllEntriesTab({ cars, locations }) {
  const [dateFilter, setDateFilter] = useState('today');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setEntries(await fetchIVREntries(dateFilter)); }
    catch (err) { setLoadError(err?.message || 'Failed to load entries.'); }
    finally { setLoading(false); }
  }, [dateFilter]);
  useEffect(() => { load(); }, [load]);
  const filtered = entries.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (e.customer_name || '').toLowerCase().includes(q) || (e.mobile_number || '').includes(q) || (e.model_name || '').toLowerCase().includes(q) || (e.location_name || '').toLowerCase().includes(q) || (e.salesperson_name || '').toLowerCase().includes(q) || (e.remarks || '').toLowerCase().includes(q);
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {DATE_FILTERS.map(f => (<button key={f.value} type="button" onClick={() => setDateFilter(f.value)} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${dateFilter === f.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>))}
        </div>
        <div className="flex gap-2">
          <input type="text" className="kiosk-input !min-h-[36px] !py-1.5 !text-sm w-52" placeholder="Search name, mobile, model…" value={search} onChange={e => setSearch(e.target.value)} />
          <button type="button" onClick={load} disabled={loading} className="text-[11px] px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 font-semibold">{loading ? '…' : '↻ Refresh'}</button>
        </div>
      </div>
      <div className="text-xs text-slate-400 font-medium">{loading ? 'Loading…' : `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`}{search && entries.length !== filtered.length ? ` (filtered from ${entries.length})` : ''}</div>
      {loadError && <p className="error-text">{loadError}</p>}
      {!loading && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400 text-sm">No entries found</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="walkin-table !mt-0 min-w-[1300px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">Entry Date</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">Call Date</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Customer Name</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Mobile</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Model</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Fuel</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Branch</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Sales Advisor</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Remarks</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Transcript</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Status</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Source</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody>{filtered.map(entry => <AllEntriesRow key={entry.id} entry={entry} cars={cars} locations={locations} onSaved={load} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── #4: AI confidence badge ──────────────────────────────────────────────────

function AIConfidenceBadge({ value }) {
  if (!value) return null;
  const len = String(value).trim().length;
  if (len >= 4) return <span className="text-[9px] px-1 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold ml-1">AI ✓</span>;
  return <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold ml-1">AI ~</span>;
}

// ─── #1: Compact details preview cell ────────────────────────────────────────

function DetailsPreviewCell({ dbLead, recordingUrl, rowStatus, savedSummary, errorMessage }) {
  const [showDrawer, setShowDrawer] = useState(false);
  if (rowStatus === STATUS.SAVED && savedSummary) {
    return <td className="px-3 py-2 text-xs text-emerald-700 max-w-[260px]"><span className="font-medium">✓ {savedSummary}</span></td>;
  }
  if (rowStatus === STATUS.ERROR) {
    return <td className="px-3 py-2 text-xs text-yellow-700 max-w-[260px]">{errorMessage}</td>;
  }
  const hasModel = dbLead?.model_name;
  const hasFuel = dbLead?.fuel_type;
  const hasSummary = dbLead?.conversation_summary;
  const hasAny = hasModel || hasFuel || hasSummary || dbLead?.customer_name;
  return (
    <td className="px-3 py-2 max-w-[260px]">
      {hasAny ? (
        <button type="button" onClick={() => setShowDrawer(true)} className="text-left w-full group">
          <div className="text-xs text-slate-700 font-medium flex items-center gap-1 flex-wrap">
            {hasModel && <span>{dbLead.model_name}<AIConfidenceBadge value={dbLead.model_name} /></span>}
            {hasFuel && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold ml-0.5">{FUEL_OPTIONS.find(f => f.code === dbLead.fuel_type)?.label || dbLead.fuel_type}</span>}
          </div>
          {hasSummary && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 group-hover:text-slate-600 transition-colors">{dbLead.conversation_summary}</p>}
          <span className="text-[10px] text-blue-500 underline mt-0.5 block group-hover:text-blue-700">View all details →</span>
        </button>
      ) : (
        <span className="text-[11px] text-slate-300">No AI data yet</span>
      )}
      {showDrawer && <DetailsDrawer dbLead={dbLead} recordingUrl={recordingUrl} onClose={() => setShowDrawer(false)} />}
    </td>
  );
}

// ─── Entry Tab IVR Row ────────────────────────────────────────────────────────

function IVRRow({ row, cars, locations, loadingCars, loadingLocations, onMarkUninterested, onSaveInterested, onFocusNext, interestedBtnRef, isFocused }) {
  const dbLead = row.dbLead || null;
  const recordingUrl = dbLead?.call_recording_url || row.callRecordingUrl || null;

  // Remarks pre-filled from AI summary. A separate ref tracks the "original"
  // value so we can show an "Edited" badge when the operator changes it.
  const aiSummary = dbLead?.conversation_summary || '';
  const initialRemarks = dbLead?.remarks || aiSummary || '';

  const [data, setData] = useState(() => ({
    ...BLANK_ROW_DATA,
    customerName: dbLead?.customer_name || '',
    modelName: dbLead?.model_name || '',
    fuelType: dbLead?.fuel_type || '',
    conversationSummary: aiSummary,
    remarks: initialRemarks,
    transcript: dbLead?.transcript || '',
    salespersonId: row.matchedSalespersonId || '',
    locationId: row.matchedLocationId || '',
  }));
  const [remarksOriginal, setRemarksOriginal] = useState(initialRemarks);
  const [salespersons, setSalespersons] = useState(row.matchedSalesperson ? [row.matchedSalesperson] : []);
  const [loadingSP, setLoadingSP] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  const customerNameRef = useRef(null);
  const remarksRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    if (!data.locationId) { setSalespersons(row.matchedSalesperson ? [row.matchedSalesperson] : []); return; }
    setLoadingSP(true);
    getSalesPersonsByLocation(data.locationId).then(res => { if (mounted) setSalespersons(res || []); }).catch(() => { if (mounted) setSalespersons([]); }).finally(() => { if (mounted) setLoadingSP(false); });
    return () => { mounted = false; };
  }, [data.locationId]);

  const set = (field, value) => setData(prev => ({ ...prev, [field]: value }));
  const isDone = row.status === STATUS.SAVED || row.status === STATUS.UNINTERESTED;
  const isSaving = row.status === STATUS.SAVING;
  const remarksEdited = data.remarks.trim() !== remarksOriginal.trim();

  const rowClass =
    row.status === STATUS.SAVED ? 'border-l-4 border-l-emerald-500 bg-emerald-50/40' :
    row.status === STATUS.UNINTERESTED ? 'border-l-4 border-l-red-300 bg-red-50/30 opacity-55' :
    row.status === STATUS.ERROR ? 'border-l-4 border-l-yellow-400 bg-yellow-50/40' :
    isFocused ? 'border-l-4 border-l-blue-500 bg-blue-50/20' :
    row.isDuplicate ? 'border-l-4 border-l-amber-400 bg-amber-50/30' :
    'border-l-4 border-l-transparent bg-white';

  const handleSave = useCallback(async () => { await onSaveInterested(row.id, data); onFocusNext(); }, [row.id, data, onSaveInterested, onFocusNext]);

  const handleRowKeyDown = useCallback((e) => {
    if (isDone || isSaving) return;
    if ((e.key === 'u' || e.key === 'U') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); onMarkUninterested(row.id); onFocusNext(); }
  }, [isDone, isSaving, onMarkUninterested, onFocusNext, row.id]);

  // Shift+Enter adds a newline in the textarea; plain Enter saves
  const handleRemarksKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
  }, [handleSave]);

  // When opening the editor, refresh from latest dbLead data (transcription may have
  // completed since the file was uploaded). Also set the remarks baseline so the
  // "Edited" badge only appears when the operator actually changes something.
  const openExpandedEditor = () => {
    const freshSummary = dbLead?.conversation_summary || aiSummary;
    const freshRemarks = dbLead?.remarks || freshSummary || '';
    setData(prev => ({
      ...prev,
      customerName: dbLead?.customer_name || prev.customerName,
      modelName: dbLead?.model_name || prev.modelName,
      fuelType: dbLead?.fuel_type || prev.fuelType,
      conversationSummary: freshSummary,
      remarks: freshRemarks,
      transcript: dbLead?.transcript || prev.transcript,
    }));
    setRemarksOriginal(freshRemarks);
    setExpanded(true);
    setTimeout(() => customerNameRef.current?.focus(), 50);
  };

  const transcriptionStatus = row.transcription_status || dbLead?.transcription_status;
  const transcriptionErr = row.transcription_error || dbLead?.transcription_error;
  const { label: txLabel, color: txColor } = normalizeTranscriptionStatus({ transcription_status: transcriptionStatus });

  useEffect(() => {
    if (!expanded) return;
    const latestSummary = dbLead?.conversation_summary || '';
    const latestTranscript = dbLead?.transcript || '';
    const latestCustomer = dbLead?.customer_name || '';
    const latestModel = dbLead?.model_name || '';
    const latestFuel = dbLead?.fuel_type || '';
    const latestRemarks = dbLead?.remarks || '';

    setData(prev => ({
      ...prev,
      customerName: prev.customerName || latestCustomer,
      modelName: prev.modelName || latestModel,
      fuelType: prev.fuelType || latestFuel,
      conversationSummary: prev.conversationSummary || latestSummary,
      remarks: prev.remarks || latestRemarks || latestSummary,
      transcript: prev.transcript || latestTranscript,
    }));
  }, [
    expanded,
    dbLead?.customer_name,
    dbLead?.model_name,
    dbLead?.fuel_type,
    dbLead?.remarks,
    dbLead?.conversation_summary,
    dbLead?.transcript,
  ]);

  const aiBadge = () => {
    if (!recordingUrl) return <span className="text-slate-300 text-[10px]">No recording</span>;
    return (
      <div className="flex flex-col gap-1">
        <span className={`w-fit text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${txColor}`}>{txLabel}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">Recording linked</span>
        {transcriptionErr && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold border border-red-200">{transcriptionErr}</span>
        )}
      </div>
    );
  };

  return (
    <tbody>
      <tr className={`border-b border-slate-100 transition-colors ${rowClass}`} onKeyDown={handleRowKeyDown}>
        <td className="px-3 py-2 text-xs text-slate-400 font-mono w-8">{row.index + 1}</td>
        <td className="px-3 py-2 text-sm font-semibold text-slate-800 w-36">
          {row.mobile}
          {row.isDuplicate && (
            <div className="mt-1 flex items-center gap-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">⚠ Already exists</span>
            </div>
          )}
          {row.isDuplicate && row.duplicateSince && (
            <div className="text-[10px] text-amber-700 mt-0.5">Last entry: {formatCallDate(row.duplicateSince)}</div>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap w-28">{row.callDate || <span className="text-slate-300">—</span>}</td>
        <td className="px-3 py-2 text-xs w-36">{row.matchedSalesperson ? <span className="text-emerald-700 font-medium">✓ {getDisplayName(row.matchedSalesperson)}</span> : <span className="text-slate-300">No match</span>}</td>
        <td className="px-3 py-2 text-xs w-32">{aiBadge()}</td>
        <td className="px-3 py-2 w-28">
          {row.status === STATUS.SAVED && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Saved</span>}
          {row.status === STATUS.UNINTERESTED && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Uninterested</span>}
          {row.status === STATUS.ERROR && <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">Error</span>}
          {row.status === STATUS.PENDING && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Pending</span>}
          {row.status === STATUS.SAVING && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 animate-pulse">Saving…</span>}
        </td>

        {/* Compact details cell with drawer */}
        <DetailsPreviewCell dbLead={dbLead} recordingUrl={recordingUrl} rowStatus={row.status} savedSummary={row.savedSummary} errorMessage={row.errorMessage} />

        <td className="px-3 py-2 text-right whitespace-nowrap">
          {!isDone && (
            <div className="flex items-center justify-end gap-1.5 relative">
              {!expanded ? (
                <button ref={interestedBtnRef} type="button"
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  onClick={openExpandedEditor} disabled={isSaving}>
                  More details
                </button>
              ) : (
                <button type="button"
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 bg-white font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                  onClick={() => setExpanded(false)} disabled={isSaving}>
                  Collapse
                </button>
              )}
              {isFocused && !expanded && (
                <div className="absolute -top-7 right-0 flex gap-1.5 text-[10px] bg-slate-800 text-white rounded-lg px-2 py-1 whitespace-nowrap shadow-lg z-10 pointer-events-none">
                  <span><kbd className="font-mono bg-slate-600 rounded px-1">Enter</kbd> details</span>
                  <span><kbd className="font-mono bg-slate-600 rounded px-1">U</kbd> skip</span>
                </div>
              )}
            </div>
          )}
        </td>
      </tr>

      {/* ── Expanded inline editor — styled to match the mockup exactly ── */}
      {expanded && !isDone && (
        <tr className="ivr-expand-wrap">
          <td colSpan={8} style={{padding:0}}>
            <IVRStyleInjector />
            <div className="ivr-expand-inner">

              {/* ── 1. Audio bar ── */}
              {recordingUrl && (
                <div className="ivr-audio-bar">
                  <button type="button" className="ivr-play-btn" onClick={() => setShowAudio(true)} title="Play recording">
                    <svg width="9" height="11" viewBox="0 0 9 11" fill="none">
                      <path d="M1 1l7 4.5L1 10V1z" fill="white"/>
                    </svg>
                  </button>
                  <div className="ivr-waveform">
                    {[5,9,14,8,17,10,13,7,16,9,11,6,14,12,8,15,10,7,13,9,11,5,8,14].map((h,i) => (
                      <span key={i} className={i < 5 ? 'ivr-wave-active' : ''} style={{height:`${h}px`}} />
                    ))}
                  </div>
                  <span className="ivr-audio-dur">2:14</span>
                  {dbLead?.transcript ? (
                    <button type="button" className="ivr-transcript-btn" onClick={() => setShowTranscript(true)}>
                      <span style={{fontSize:'13px'}}>📄</span> View transcript
                    </button>
                  ) : (
                    <span className={`ivr-tx-status ${txColor}`}>{txLabel}</span>
                  )}
                  {row.callDate && <span className="ivr-audio-date">{row.callDate}</span>}
                </div>
              )}

              {/* ── 2. AI Summary ── */}
              {data.conversationSummary && (
                <div className="ivr-ai-box">
                  <div className="ivr-ai-box-header">
                    <span className="ivr-ai-label">AI Summary</span>
                    <button
                      type="button"
                      className="ivr-ai-copy-btn"
                      onClick={() => {
                        set('remarks', data.conversationSummary);
                        setRemarksOriginal(data.conversationSummary);
                        setTimeout(() => remarksRef.current?.focus(), 50);
                      }}>
                      ↓ Copy to remarks
                    </button>
                  </div>
                  <p className="ivr-ai-text">{data.conversationSummary}</p>
                </div>
              )}

              {/* ── 3. Fields grid: Branch · Advisor · Name · Model · Fuel ── */}
              <div className="ivr-fields-grid">

                <div className="ivr-field">
                  <span className="ivr-field-label">Branch</span>
                  <select className="ivr-select" value={data.locationId} onChange={e => set('locationId', e.target.value)} disabled={loadingLocations}>
                    <option value="">{loadingLocations ? 'Loading…' : 'Select branch'}</option>
                    {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name || `Branch #${loc.id}`}</option>)}
                  </select>
                </div>

                <div className="ivr-field">
                  <span className="ivr-field-label">
                    Sales Advisor
                    {data.salespersonId && row.matchedSalesperson && <span className="ivr-badge-match">Auto-matched ✓</span>}
                  </span>
                  <select className="ivr-select" value={data.salespersonId} onChange={e => set('salespersonId', e.target.value)} disabled={loadingSP}>
                    <option value="">{loadingSP ? 'Loading…' : 'Select advisor'}</option>
                    {salespersons.map(sp => <option key={sp.id} value={sp.id}>{getDisplayName(sp)}</option>)}
                  </select>
                </div>

                <div className="ivr-field">
                  <span className="ivr-field-label">Customer Name</span>
                  <input ref={customerNameRef} type="text" className="ivr-input" placeholder="Optional" value={data.customerName} onChange={e => set('customerName', e.target.value)} />
                </div>

                <div className="ivr-field">
                  <span className="ivr-field-label">
                    Model
                    {data.modelName && <span className="ivr-badge-ai">AI ✓</span>}
                  </span>
                  <select className="ivr-select" value={data.modelName} onChange={e => set('modelName', e.target.value)} disabled={loadingCars}>
                    <option value="">{loadingCars ? 'Loading…' : 'Optional'}</option>
                    {cars.map(car => <option key={car.id} value={car.name}>{car.name}</option>)}
                  </select>
                </div>

                <div className="ivr-field">
                  <span className="ivr-field-label">
                    Fuel
                    {data.fuelType && <span className="ivr-badge-ai">AI ✓</span>}
                  </span>
                  <select className="ivr-select" value={data.fuelType} onChange={e => set('fuelType', e.target.value)}>
                    <option value="">Optional</option>
                    {FUEL_OPTIONS.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}
                  </select>
                </div>

              </div>

              {/* ── 4. Remarks textarea ── */}
              <div className="ivr-remarks-wrap">
                <div className="ivr-remarks-header">
                  <span className="ivr-remarks-title">Remarks</span>
                  {!remarksEdited && data.remarks && <span className="ivr-badge-prefill">Pre-filled from AI ✓</span>}
                  {remarksEdited && <span className="ivr-badge-edited">Edited</span>}
                  <span className="ivr-remarks-hint">Shift+Enter for new line · Enter to save</span>
                </div>
                <textarea
                  ref={remarksRef}
                  className="ivr-textarea"
                  placeholder="Operator remarks — edit AI summary or write your own"
                  value={data.remarks}
                  onChange={e => set('remarks', e.target.value)}
                  onKeyDown={handleRemarksKeyDown}
                />
              </div>

              <div className="ivr-action-bar">
                <span className="ivr-action-hint">Shift+Enter adds line break · Enter on remarks saves</span>
                <span className="ivr-action-spacer" />
                <button
                  type="button"
                  className="ivr-action-btn ivr-action-btn-neutral"
                  onClick={() => setExpanded(false)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ivr-action-btn ivr-action-btn-danger"
                  onClick={() => {
                    onMarkUninterested(row.id);
                    onFocusNext();
                  }}
                  disabled={isSaving}
                  title="U key shortcut"
                >
                  Uninterested
                </button>
                <button
                  type="button"
                  className="ivr-action-btn ivr-action-btn-primary"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Interested'}
                </button>
              </div>

            </div>
          </td>
        </tr>
      )}

      {showTranscript && <TranscriptModal transcript={dbLead?.transcript} onClose={() => setShowTranscript(false)} />}
      {showAudio && <AudioPopover recordingUrl={recordingUrl} onClose={() => setShowAudio(false)} />}
    </tbody>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function IVREntryScreen() {
  const [activeTab, setActiveTab] = useState('entry');
  const [fileError, setFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [hasImported, setHasImported] = useState(false);
  // #3: clickable status filter
  const [statusFilter, setStatusFilter] = useState(null);
  // #5: focused row for progress tracking
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [cars, setCars] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedUploadLocationId, setSelectedUploadLocationId] = useState('');
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const interestedBtnRefs = useRef({});
  const rowsRef = useRef([]);
  // Transcription batch creation state
  const [transcriptionStarted, setTranscriptionStarted] = useState(false);
  const [batchingLeads, setBatchingLeads] = useState(false);
  // Upload success feedback
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState('');
  // Track if we're fetching latest batch on mount
  const [isCheckingLatestBatch, setIsCheckingLatestBatch] = useState(false);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    let mounted = true;
    getAvailableCars().then(data => { if (mounted) setCars((data || []).filter(c => c?.name?.trim())); }).catch(() => {}).finally(() => { if (mounted) setLoadingCars(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    getLocations().then(data => { if (mounted) setLocations(data || []); }).catch(() => {}).finally(() => { if (mounted) setLoadingLocations(false); });
    return () => { mounted = false; };
  }, []);

  // Fetch latest uploaded batch when component mounts or "entry" tab is active (if no rows currently loaded)
  useEffect(() => {
    if (activeTab !== 'entry' || hasImported || rows.length > 0) return;

    const fetchLatestBatch = async () => {
      setIsCheckingLatestBatch(true);
      try {
        const latestBatch = await getLatestUploadedBatch(60); // Look back 60 minutes
        if (latestBatch && latestBatch.length > 0) {
          // Convert DB records to row format for display
          const convertedRows = latestBatch.map((lead, index) => ({
            id: String(lead.id),
            ivrLeadsId: lead.id,
            index,
            mobile: lead.mobile_number,
            callDate: lead.call_datetime ? new Date(lead.call_datetime).toLocaleDateString() : null,
            connectedToRaw: null,
            callRecordingUrl: lead.call_recording_url || null,
            dbLead: {
              id: lead.id,
              customer_name: lead.customer_name,
              model_name: lead.model_name,
              fuel_type: lead.fuel_type,
              remarks: lead.remarks,
              conversation_summary: lead.conversation_summary,
              transcript: lead.transcript,
              transcription_status: lead.transcription_status,
              transcription_error: lead.transcription_error,
              call_recording_url: lead.call_recording_url,
            },
            matchedSalesperson: null,
            matchedSalespersonId: lead.salesperson_id ? String(lead.salesperson_id) : '',
            matchedLocationId: lead.location_id ? String(lead.location_id) : '',
            isDuplicate: false,
            duplicateSince: null,
            status: STATUS.PENDING,
            savedSummary: lead.conversation_summary || null,
            errorMessage: null,
            transcription_status: lead.transcription_status,
            transcription_error: lead.transcription_error,
          }));

          setRows(convertedRows);
          setHasImported(true);
          setTranscriptionStarted(true); // Enable polling for latest data
          setUploadSuccessMsg(`Showing latest ${convertedRows.length} uploaded entries (restored from database)`);
          
          // Clear success message after 4 seconds
          setTimeout(() => setUploadSuccessMsg(''), 4000);
        }
      } catch (err) {
        console.error('Failed to fetch latest batch:', err);
      } finally {
        setIsCheckingLatestBatch(false);
      }
    };

    fetchLatestBatch();
  }, [activeTab, hasImported, rows.length]);

  // Poll for transcription status updates
  useEffect(() => {
    if (!transcriptionStarted) return;

    const pollTranscriptionStatus = async () => {
      const leadsWithIds = rowsRef.current.filter(r => r.ivrLeadsId);
      if (leadsWithIds.length === 0) return;

      try {
        const { data: leads, error } = await supabase
          .from(IVR_LEADS_TABLE)
          .select('id, customer_name, model_name, fuel_type, remarks, conversation_summary, transcript, transcription_status, transcription_error, call_recording_url')
          .in('id', leadsWithIds.map(r => r.ivrLeadsId));

        if (error || !leads) return;

        const leadMap = new Map(leads.map(lead => [lead.id, lead]));
        setRows(prev => prev.map(row => {
          if (!row.ivrLeadsId || !leadMap.has(row.ivrLeadsId)) return row;
          const latestLead = leadMap.get(row.ivrLeadsId);
          return {
            ...row,
            dbLead: { ...(row.dbLead || {}), ...latestLead },
            callRecordingUrl: row.callRecordingUrl || latestLead.call_recording_url || null,
            transcription_status: latestLead.transcription_status || null,
            transcription_error: latestLead.transcription_error || null,
          };
        }));
      } catch (err) {
        console.error('Failed to poll transcription status:', err);
      }
    };

    // Poll immediately and then every 2 seconds
    pollTranscriptionStatus();
    const timer = setInterval(pollTranscriptionStatus, 2000);

    return () => clearInterval(timer);
  }, [transcriptionStarted]);

  async function batchInsertIVRLeads(parseRowsWithMatches) {
    if (!selectedUploadLocationId) throw new Error(UPLOAD_BRANCH_REQUIRED_ERROR);
    const leadsToInsert = parseRowsWithMatches.map(({ mobile, callDate, connectedToRaw, matchedSalesperson, callRecordingUrl }) => ({
      mobile_number: mobile,
      call_datetime: callDate ? new Date(callDate).toISOString() : null,
      connected_to_raw: connectedToRaw,
      salesperson_id: matchedSalesperson?.id || null,
      location_id: selectedUploadLocationId,
      call_recording_url: callRecordingUrl || null,
      review_status: 'pending',
    }));
    const { data, error } = await supabase.from(IVR_LEADS_TABLE).insert(leadsToInsert).select('id, call_recording_url, customer_name, model_name, fuel_type, conversation_summary, remarks, transcript, transcription_status');
    if (error) throw error;
    return data || [];
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isZip = file.name.endsWith('.zip');
    const isCsv = file.name.endsWith('.csv');
    if (!isZip && !isCsv) { setFileError('Please upload the ZIP file downloaded from your IVR portal, or a CSV file.'); e.target.value = ''; return; }
    if (!selectedUploadLocationId) { setFileError(UPLOAD_BRANCH_REQUIRED_ERROR); e.target.value = ''; return; }
    setFileError(''); setImporting(true); setUploadSuccessMsg('');
    try {
      let text;
      if (isZip) {
        if (!window.JSZip) {
          await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; script.onload = resolve; script.onerror = () => reject(new Error('Failed to load ZIP library.')); document.head.appendChild(script); });
        }
        const arrayBuffer = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(arrayBuffer);
        const csvFile = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.csv'));
        if (!csvFile) { setFileError('No CSV file found inside the ZIP.'); setImporting(false); e.target.value = ''; return; }
        text = await csvFile.async('text');
      } else { text = await file.text(); }

      const parsed = parseIVRFile(text);
      if (parsed.length === 0) { setFileError('No valid customer numbers found. Make sure the file has a CustomerNumber column.'); setImporting(false); e.target.value = ''; return; }

      const connectedPhones = parsed.map(r => r.connectedToRaw).filter(Boolean);
      const allMobiles = parsed.map(r => r.mobile).filter(Boolean);

      // Run employee match and duplicate check in parallel
      const [empByMobile, duplicateMap] = await Promise.all([
        fetchEmployeesByMobile(connectedPhones),
        checkDuplicatePhones(allMobiles),
      ]);

      // Prepare rows with preview data
      const newRows = parsed.map(({ mobile, callDate, connectedToRaw, callRecordingUrl }, index) => {
        const connectedNormalized = normalizePhone(connectedToRaw);
        const matchedSalesperson = connectedNormalized ? empByMobile.get(connectedNormalized) || null : null;
        const isDuplicate = duplicateMap.has(mobile);
        const duplicateSince = isDuplicate ? duplicateMap.get(mobile) : null;
        return {
          id: `preview-${index}-${mobile}`,
          ivrLeadsId: null,
          index,
          mobile,
          callDate,
          connectedToRaw,
          callRecordingUrl: callRecordingUrl || null,
          dbLead: null,
          matchedSalesperson,
          matchedSalespersonId: matchedSalesperson?.id ? String(matchedSalesperson.id) : '',
          matchedLocationId: String(selectedUploadLocationId),
          isDuplicate,
          duplicateSince,
          status: STATUS.SAVING,
          savedSummary: null,
          errorMessage: null,
          transcription_status: null,
          transcription_error: null,
        };
      });

      // Show preview with "saving" status
      setRows(newRows);
      setHasImported(true);
      setStatusFilter(null);

      // AUTO-SAVE: Create batch draft leads immediately
      const draftLeads = newRows.map(row => ({
        mobile: row.mobile,
        callDate: row.callDate || null,
        callRecordingUrl: row.callRecordingUrl || null,
        locationId: selectedUploadLocationId,
        salespersonId: row.matchedSalesperson?.id || null,
      }));

      try {
        const createdLeads = await createBatchDraftLeads(draftLeads);
        
        // Map returned lead IDs back to rows by mobile number
        const leadMap = new Map(createdLeads.map(lead => [lead.mobile_number, lead.id]));
        const savedRowsCount = createdLeads.length;

        setRows(prev => prev.map(row => {
          const leadId = leadMap.get(row.mobile);
          if (leadId) {
            return {
              ...row,
              ivrLeadsId: leadId,
              status: STATUS.PENDING,
              transcription_status: row.callRecordingUrl ? 'pending' : null,
            };
          }
          return row;
        }));

        setTranscriptionStarted(true);
        setUploadSuccessMsg(`✓ Saved ${savedRowsCount} new entries. Transcription in progress...`);

        // Auto-clear success message after 4 seconds
        setTimeout(() => setUploadSuccessMsg(''), 4000);

        // Focus first row after successful save
        setTimeout(() => {
          const firstId = newRows[0]?.id;
          if (firstId) { interestedBtnRefs.current[firstId]?.focus(); setFocusedRowId(firstId); }
        }, 100);
      } catch (autoSaveErr) {
        // If auto-save fails, show error but allow user to proceed
        console.error('Auto-save failed:', autoSaveErr);
        setFileError(`Upload processed but saving to database failed: ${autoSaveErr?.message || 'Unknown error'}. Try uploading again.`);
        setRows(prev => prev.map(r => ({ ...r, status: STATUS.ERROR, errorMessage: 'Failed to save entry' })));
      }
    } catch (err) { 
      setFileError(err?.message || 'Failed to process file.');
    }
    finally { setImporting(false); e.target.value = ''; }
  };

  const handleReset = () => { setRows([]); setHasImported(false); setFileError(''); setStatusFilter(null); setFocusedRowId(null); setTranscriptionStarted(false); setUploadSuccessMsg(''); interestedBtnRefs.current = {}; };

  // No background DB sync needed — rows are inserted only when executive acts,
  // so there is no pre-existing DB record to poll for transcription updates.

  const setRowStatus = useCallback((rowId, status, extra = {}) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, status, ...extra } : r));
  }, []);

  const focusNextPendingRow = useCallback((afterRowId) => {
    setRows(currentRows => {
      const afterIndex = currentRows.findIndex(r => r.id === afterRowId);
      const nextPending = currentRows.find((r, i) => i > afterIndex && r.status === STATUS.PENDING);
      if (nextPending) { setTimeout(() => { interestedBtnRefs.current[nextPending.id]?.focus(); setFocusedRowId(nextPending.id); }, 60); }
      return currentRows;
    });
  }, []);

  const handleStartTranscription = useCallback(async () => {
    // This is now a fallback in case auto-save didn't occur (e.g., if entries were manually created)
    // In most cases, this won't be called since auto-save happens during file upload
    if (rows.length === 0 || transcriptionStarted || batchingLeads) return;
    
    const rowsNeedingSave = rows.filter(r => !r.ivrLeadsId);
    if (rowsNeedingSave.length === 0) {
      // All rows already saved, just start polling
      setTranscriptionStarted(true);
      return;
    }

    setBatchingLeads(true);
    try {
      const draftLeads = rowsNeedingSave.map(row => ({
        mobile: row.mobile,
        callDate: row.callDate || null,
        callRecordingUrl: row.callRecordingUrl || null,
        locationId: row.matchedLocationId || null,
        salespersonId: row.matchedSalesperson?.id || null,
      }));

      const createdLeads = await createBatchDraftLeads(draftLeads);
      const leadMap = new Map(createdLeads.map(lead => [lead.mobile_number, lead.id]));
      
      setRows(prev => prev.map(row => {
        const leadId = leadMap.get(row.mobile);
        return leadId ? { ...row, ivrLeadsId: leadId, status: STATUS.PENDING, transcription_status: row.callRecordingUrl ? 'pending' : null } : row;
      }));

      setTranscriptionStarted(true);
      console.log(`✓ Started transcription for ${createdLeads.length} leads`);
    } catch (err) {
      console.error('Failed to start transcription batch:', err);
      setFileError(`Failed to start transcription: ${err?.message || 'Unknown error'}`);
    } finally {
      setBatchingLeads(false);
    }
  }, [rows, transcriptionStarted, batchingLeads]);

  const handleMarkUninterested = useCallback(async (rowId) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    setRowStatus(rowId, STATUS.UNINTERESTED);
    try {
      if (row.ivrLeadsId) {
        // Already in DB (edge case), just update status
        await supabase.from(IVR_LEADS_TABLE).update({ review_status: 'uninterested', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.ivrLeadsId);
      } else {
        // Not in DB yet — insert as uninterested so there's a record
        await createIVRLead({
          mobile_number: row.mobile,
          call_datetime: row.callDate ? new Date(row.callDate).toISOString() : null,
          salesperson_id: row.matchedSalesperson?.id || null,
          location_id: row.matchedLocationId || null,
          call_recording_url: row.callRecordingUrl || null,
          customer_name: null, model_name: null, fuel_type: null, remarks: null, transcript: null, conversation_summary: null,
        }).then(saved => {
          supabase.from(IVR_LEADS_TABLE).update({ review_status: 'uninterested', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', saved.id).then(() => {});
        });
      }
    } catch (err) { console.error(`Failed to save uninterested lead for ${row.mobile}:`, err); }
  }, [rows, setRowStatus]);

  const handleSaveInterested = useCallback(async (rowId, data) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    setRowStatus(rowId, STATUS.SAVING);
    try {
      const effectiveLocationId = data.locationId || row.matchedLocationId || null;
      let ivrLeadId = row.ivrLeadsId;

      if (ivrLeadId) {
        // Draft lead already exists (from batch creation) — just update it
        await updateIVRLead(ivrLeadId, {
          customer_name: data.customerName?.trim() || null,
          model_name: data.modelName || null,
          fuel_type: data.fuelType || null,
          salesperson_id: data.salespersonId || null,
          location_id: effectiveLocationId,
          remarks: data.remarks?.trim() || null,
          markInterested: true, // flag to set review_status = 'interested'
        });
      } else {
        // Insert into DB now — this is the first time this row is saved (no batch creation happened)
        const savedLead = await createIVRLead({
          customer_name: data.customerName?.trim() || null,
          mobile_number: row.mobile,
          model_name: data.modelName || null,
          fuel_type: data.fuelType || null,
          salesperson_id: data.salespersonId || null,
          location_id: effectiveLocationId,
          remarks: data.remarks?.trim() || null,
          transcript: data.transcript || null,
          conversation_summary: data.conversationSummary?.trim() || null,
          call_datetime: row.callDate ? new Date(row.callDate).toISOString() : null,
          call_recording_url: row.callRecordingUrl || null,
          autoInvoke: true, // invoke transcription if recording exists
        });
        ivrLeadId = savedLead.id;
      }

      const promotionPayload = {
        customer_name: data.customerName?.trim() || null,
        mobile_number: row.mobile,
        model_name: data.modelName || null,
        fuel_type: data.fuelType || null,
        salesperson_id: data.salespersonId || null,
        location_id: effectiveLocationId,
        remarks: data.remarks?.trim() || null,
        conversation_summary: data.conversationSummary?.trim() || null,
        call_datetime: row.callDate ? new Date(row.callDate).toISOString() : null,
      };
      await markIVRLeadInterested(ivrLeadId, promotionPayload);

      const parts = [];
      if (data.customerName?.trim()) parts.push(data.customerName.trim());
      if (data.modelName) parts.push(data.modelName);
      if (data.fuelType) parts.push(FUEL_OPTIONS.find(f => f.code === data.fuelType)?.label || data.fuelType);
      if (data.remarks?.trim()) parts.push(`"${data.remarks.trim()}"`);
      setRowStatus(rowId, STATUS.SAVED, { savedSummary: parts.join(' · ') || 'Marked interested' });
    } catch (error) { setRowStatus(rowId, STATUS.ERROR, { errorMessage: error?.message || 'Save failed.' }); }
  }, [rows, setRowStatus]);

  const counts = rows.reduce((acc, r) => { if (r.status === STATUS.SAVED) acc.saved++; else if (r.status === STATUS.UNINTERESTED) acc.uninterested++; else acc.pending++; return acc; }, { saved: 0, uninterested: 0, pending: 0 });
  const matchedCount = rows.filter(r => r.matchedSalesperson).length;
  const duplicateCount = rows.filter(r => r.isDuplicate).length;
  const reviewedCount = counts.saved + counts.uninterested;
  const progressPct = rows.length > 0 ? Math.round((reviewedCount / rows.length) * 100) : 0;

  // #3: filter rows by clicked status card
  const visibleRows = statusFilter ? rows.filter(r => {
    if (statusFilter === 'pending') return r.status === STATUS.PENDING;
    if (statusFilter === 'saved') return r.status === STATUS.SAVED;
    if (statusFilter === 'uninterested') return r.status === STATUS.UNINTERESTED;
    if (statusFilter === 'matched') return !!r.matchedSalesperson;
    if (statusFilter === 'duplicate') return !!r.isDuplicate;
    return true;
  }) : rows;

  const assignmentSummary = useMemo(() => {
    const bySalesperson = new Map();
    let unassigned = 0;

    for (const row of visibleRows) {
      const label = getBestSalespersonLabel(row);
      if (!label) {
        unassigned += 1;
        continue;
      }
      bySalesperson.set(label, (bySalesperson.get(label) || 0) + 1);
    }

    const assignedCounts = [...bySalesperson.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });

    return {
      assignedCounts,
      unassigned,
      total: visibleRows.length,
    };
  }, [visibleRows]);

  const statCards = [
    { key: null, label: 'Total', value: rows.length, color: 'bg-slate-100 text-slate-700', activeColor: 'bg-slate-800 text-white' },
    { key: 'matched', label: 'Matched', value: matchedCount, color: 'bg-emerald-50 text-emerald-700', activeColor: 'bg-emerald-700 text-white' },
    { key: 'duplicate', label: 'Duplicates', value: duplicateCount, color: 'bg-amber-50 text-amber-700', activeColor: 'bg-amber-500 text-white' },
    { key: 'pending', label: 'Pending', value: counts.pending, color: 'bg-orange-50 text-orange-600', activeColor: 'bg-orange-500 text-white' },
    { key: 'saved', label: 'Saved', value: counts.saved, color: 'bg-green-50 text-green-700', activeColor: 'bg-green-600 text-white' },
    { key: 'uninterested', label: 'Uninterested', value: counts.uninterested, color: 'bg-red-50 text-red-600', activeColor: 'bg-red-600 text-white' },
  ];

  return (
    <section className="kiosk-card mx-auto w-full rounded-2xl p-6 shadow-lg" style={{ maxWidth: '1200px' }}>
      <h1 className="kiosk-title !mb-1 text-4xl">IVR Lead Entry</h1>
      <p className="mb-5 text-base text-slate-600">Upload your IVR call report ZIP. Leads are saved first, then transcription runs in the background.</p>

      <div className="mb-6 flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
        {[{ id: 'entry', label: '+ New Entry' }, { id: 'all', label: 'All Entries' }].map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'entry' && (
        !hasImported ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold text-slate-700" htmlFor="ivr-upload-branch">Branch</label>
                <select
                  id="ivr-upload-branch"
                  className="kiosk-select !min-h-[38px] !py-1.5 !text-sm w-72"
                  value={selectedUploadLocationId}
                  onChange={(e) => {
                    setSelectedUploadLocationId(e.target.value);
                    setFileError('');
                  }}
                  disabled={loadingLocations}
                >
                  <option value="">{loadingLocations ? 'Loading branches…' : 'Select branch before upload'}</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name || `Branch #${loc.id}`}</option>)}
                </select>
                {selectedUploadLocationId && (
                  <span className="text-xs text-slate-500">
                    Selected: {locations.find(loc => String(loc.id) === String(selectedUploadLocationId))?.name || `Branch #${selectedUploadLocationId}`}
                  </span>
                )}
              </div>
            </div>
            <div
              className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) { const dt = new DataTransfer(); dt.items.add(file); fileInputRef.current.files = dt.files; handleFileChange({ target: fileInputRef.current }); } }}
            >
              <div className="text-4xl mb-3">📂</div>
              <p className="text-lg font-semibold text-slate-700 mb-1">{importing ? 'Processing file…' : 'Upload IVR Call Report (ZIP or CSV)'}</p>
              <p className="text-sm text-slate-500 mb-4">Click to browse or drag &amp; drop</p>
              <div className="inline-flex items-center gap-2 text-xs text-slate-400 bg-white rounded-xl border border-slate-200 px-4 py-2">
                <span>Required columns:</span>
                <code className="bg-slate-100 rounded px-1">CallDate</code>
                <code className="bg-slate-100 rounded px-1">CustomerNumber</code>
                <code className="bg-slate-100 rounded px-1">ConnectedTo</code>
                <code className="bg-slate-100 rounded px-1">CallRecording</code>
              </div>
              <input ref={fileInputRef} type="file" accept=".zip,.csv" className="hidden" onChange={handleFileChange} />
            </div>
            {fileError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{fileError}</div>}
            {uploadSuccessMsg && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">{uploadSuccessMsg}</div>}
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">Upload the <strong>ZIP file</strong> directly from your IVR portal. Leads are <strong>automatically saved and transcription starts immediately</strong>. Mark them Interested or Uninterested to complete the process.</div>
          </div>
        ) : (
          <div className="space-y-3">

            {/* Two-column top area: left = upload bar + alerts + progress + stats, right = assignment card */}
            <div className="flex gap-4 items-start">

              {/* Left column */}
              <div className="flex-1 min-w-0 space-y-3">

                {/* Upload / reset bar */}
                <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
                  <span className="text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">{rows.length} leads</span> loaded from file
                  </span>
                  <button type="button" className="btn border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 text-sm px-4 h-9 rounded-xl" onClick={handleReset}>← Upload New File</button>
                </div>

                {/* Duplicate warning banner */}
                {duplicateCount > 0 && (
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <span className="text-amber-600 text-base">⚠</span>
                    <div className="text-sm text-amber-800">
                      <span className="font-semibold">{duplicateCount} phone number{duplicateCount > 1 ? 's' : ''} already exist{duplicateCount === 1 ? 's' : ''} in the IVR leads table.</span>
                      {' '}These rows are highlighted in amber. You can still mark them Interested if it's a fresh call.
                      {' '}<button type="button" onClick={() => setStatusFilter('duplicate')} className="underline font-semibold hover:text-amber-900">View duplicates</button>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                {rows.length > 0 && reviewedCount < rows.length && (
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      Reviewed <span className="font-semibold text-slate-800">{reviewedCount}</span> of <span className="font-semibold text-slate-800">{rows.length}</span>
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{counts.pending} remaining</span>
                  </div>
                )}
                {rows.length > 0 && reviewedCount === rows.length && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-700 font-semibold">
                    ✓ All {rows.length} leads reviewed!
                  </div>
                )}

                {/* Stat filter cards */}
                <div className="flex flex-wrap gap-2">
                  {statCards.map(card => {
                    const isActive = statusFilter === card.key;
                    return (
                      <button key={String(card.key)} type="button"
                        onClick={() => setStatusFilter(isActive ? null : card.key)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all border ${isActive ? `${card.activeColor} border-transparent shadow-sm` : `${card.color} border-transparent hover:border-slate-200 hover:shadow-sm`}`}
                        title={card.key ? `Filter by ${card.label}` : 'Show all'}>
                        {card.label}: {card.value}{isActive && <span className="ml-1 opacity-70">✕</span>}
                      </button>
                    );
                  })}
                </div>

              </div>

              {/* Right column: Assignment card */}
              <div className="w-56 flex-shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 shadow-sm">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Live Assignment</p>
                  <span className="text-[11px] text-slate-500">{assignmentSummary.total}</span>
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {assignmentSummary.assignedCounts.map(item => (
                    <div key={item.name} className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                      <span className="truncate" title={item.name}>{item.name}</span>
                      <span className="font-semibold text-blue-700 bg-blue-50 rounded px-1.5">{item.count}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-700 border-t border-slate-200 pt-1">
                    <span className="text-slate-500">Unassigned</span>
                    <span className="font-semibold text-amber-700 bg-amber-50 rounded px-1.5">{assignmentSummary.unassigned}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Keyboard hints */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span><kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[10px]">Enter</kbd> next field</span>
              <span><kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[10px]">Tab</kbd> forward</span>
              <span><kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[10px]">↑↓</kbd> dropdown</span>
              <span><kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[10px]">U</kbd> uninterested</span>
              <span><kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[10px]">Enter</kbd> on remarks saves</span>
            </div>

            {statusFilter && (
              <p className="text-xs text-slate-400">
                Showing {visibleRows.length} of {rows.length} leads ·{' '}
                <button type="button" onClick={() => setStatusFilter(null)} className="text-blue-500 underline">Clear filter</button>
              </p>
            )}

            {/* Transcription bar — just above the table */}
            {!transcriptionStarted && rows.length > 0 && (
              <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">{rows.filter(r => r.callRecordingUrl).length} leads have recordings</span> ready for transcription
                </p>
                <button
                  type="button"
                  className="btn bg-blue-600 text-white hover:bg-blue-700 text-sm px-4 h-9 rounded-lg disabled:opacity-50"
                  onClick={handleStartTranscription}
                  disabled={batchingLeads}
                >
                  {batchingLeads ? 'Starting…' : '▶ Preview & Start Transcription'}
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="walkin-table !mt-0">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 w-8">#</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Mobile</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Call Date</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Advisor Match</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">AI Status</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Status</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">Details</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                {visibleRows.map(row => (
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
                    isFocused={focusedRowId === row.id}
                    interestedBtnRef={el => { if (el) interestedBtnRefs.current[row.id] = el; else delete interestedBtnRefs.current[row.id]; }}
                  />
                ))}
              </table>
            </div>
          </div>
        )
      )}

      {activeTab === 'all' && <AllEntriesTab cars={cars} locations={locations} />}
    </section>
  );
}