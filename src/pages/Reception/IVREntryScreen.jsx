import { useEffect, useState, useCallback, useRef } from 'react';
import { createIVRLead } from '../../services/ivrService';
import {
  getAvailableCars,
  getLocations,
  getSalesPersonsByLocation
} from '../../services/walkinService';
 
// ─── Helpers ─────────────────────────────────────────────────────────────────
 
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
 
const BLANK_ROW_DATA = {
  customerName: '',
  modelName: '',
  locationId: '',
  salespersonId: '',
  remarks: '',
};
 
const STATUS = {
  PENDING: 'pending',
  SAVING: 'saving',
  SAVED: 'saved',
  UNINTERESTED: 'uninterested',
  ERROR: 'error',
};
 
// ─── Row component ────────────────────────────────────────────────────────────
 
function IVRRow({
  row,
  cars,
  locations,
  loadingCars,
  loadingLocations,
  onMarkUninterested,
  onSaveInterested,
  onFocusNext,           // () => void — called after save/uninterested to move focus
  interestedBtnRef,      // callback ref so parent can imperatively focus this button
}) {
  const [data, setData] = useState(BLANK_ROW_DATA);
  const [salespersons, setSalespersons] = useState([]);
  const [loadingSP, setLoadingSP] = useState(false);
  const [expanded, setExpanded] = useState(false);
 
  // Refs for each detail field — used to chain Enter key between them
  const customerNameRef = useRef(null);
  const modelRef = useRef(null);
  const branchRef = useRef(null);
  const advisorRef = useRef(null);
  const remarksRef = useRef(null);
 
  // Load salespersons when branch changes
  useEffect(() => {
    let mounted = true;
    if (!data.locationId) {
      setSalespersons([]);
      setData((prev) => ({ ...prev, salespersonId: '' }));
      return;
    }
    setLoadingSP(true);
    getSalesPersonsByLocation(data.locationId)
      .then((res) => {
        if (mounted) {
          setSalespersons(res || []);
          setData((prev) => ({ ...prev, salespersonId: '' }));
        }
      })
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
    row.status === STATUS.ERROR ? 'bg-yellow-50' :
    'bg-white';
 
  // Save this row then move focus to next pending row
  const handleSave = useCallback(async () => {
    await onSaveInterested(row.id, data);
    onFocusNext();
  }, [row.id, data, onSaveInterested, onFocusNext]);
 
  // U key on the row = mark uninterested + move to next
  const handleRowKeyDown = useCallback((e) => {
    if (isDone || isSaving) return;
    if (e.key === 'u' || e.key === 'U') {
      // Don't fire if user is typing in a text input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      onMarkUninterested(row.id);
      onFocusNext();
    }
  }, [isDone, isSaving, onMarkUninterested, onFocusNext, row.id]);
 
  // Enter on a text input moves to the next field ref provided
  const chainEnter = (e, nextRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };
 
  // Enter on Remarks = save
  const handleRemarksKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);
 
  return (
    <tbody>
      {/* Main row */}
      <tr
        className={`border-b border-slate-100 transition-colors ${rowBg}`}
        onKeyDown={handleRowKeyDown}
      >
        {/* # */}
        <td className="px-3 py-2 text-xs text-slate-400 font-mono w-8">
          {row.index + 1}
        </td>
 
        {/* Mobile */}
        <td className="px-3 py-2 text-sm font-semibold text-slate-800 w-36">
          {row.mobile}
        </td>
 
        {/* Status badge */}
        <td className="px-3 py-2 w-28">
          {row.status === STATUS.SAVED && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
              ✓ Saved
            </span>
          )}
          {row.status === STATUS.UNINTERESTED && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
              Uninterested
            </span>
          )}
          {row.status === STATUS.ERROR && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">
              Error
            </span>
          )}
          {row.status === STATUS.PENDING && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              Pending
            </span>
          )}
          {row.status === STATUS.SAVING && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 animate-pulse">
              Saving…
            </span>
          )}
        </td>
 
        {/* Saved summary / error message */}
        <td className="px-3 py-2 text-xs text-slate-500">
          {row.status === STATUS.SAVED && row.savedSummary ? (
            <span>{row.savedSummary}</span>
          ) : row.status === STATUS.ERROR ? (
            <span className="text-yellow-700">{row.errorMessage}</span>
          ) : null}
        </td>
 
        {/* Action buttons */}
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {!isDone && (
            <div className="flex items-center justify-end gap-1.5">
              {!expanded ? (
                <button
                  ref={interestedBtnRef}
                  type="button"
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  onClick={() => {
                    setExpanded(true);
                    // Auto-focus first detail field after expand
                    setTimeout(() => customerNameRef.current?.focus(), 50);
                  }}
                  disabled={isSaving}
                  title="Enter/Space to expand · U to mark Uninterested"
                >
                  Interested
                </button>
              ) : (
                <button
                  type="button"
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              )}
 
              <button
                type="button"
                className="text-[11px] px-2.5 py-1 rounded-lg border border-red-200 text-red-600 bg-white font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                onClick={() => { onMarkUninterested(row.id); onFocusNext(); }}
                disabled={isSaving}
                title="U key shortcut"
              >
                Uninterested
              </button>
 
              {expanded && (
                <button
                  type="button"
                  className="text-[11px] text-slate-400 underline ml-0.5"
                  onClick={() => setExpanded(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
 
      {/* Expanded detail row */}
      {expanded && !isDone && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={5} className="px-4 py-3">
            <p className="text-[11px] text-slate-400 mb-2.5">
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Enter</kbd> moves to next field &nbsp;·&nbsp;
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">↑ ↓</kbd> navigate dropdowns &nbsp;·&nbsp;
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">Enter</kbd> on Remarks saves &nbsp;·&nbsp;
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono">U</kbd> marks Uninterested
            </p>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
 
              {/* 1. Customer Name → Enter → Model */}
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Customer Name
                <input
                  ref={customerNameRef}
                  type="text"
                  className="kiosk-input !min-h-[36px] !py-1.5 !text-sm"
                  placeholder="Optional"
                  value={data.customerName}
                  onChange={(e) => set('customerName', e.target.value)}
                  onKeyDown={(e) => chainEnter(e, modelRef)}
                />
              </label>
 
              {/* 2. Model dropdown — Tab moves to Branch naturally */}
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Model
                <select
                  ref={modelRef}
                  className="kiosk-select !min-h-[36px] !py-1.5 !text-sm"
                  value={data.modelName}
                  onChange={(e) => set('modelName', e.target.value)}
                  disabled={loadingCars}
                  onKeyDown={(e) => {
                    // Tab handled by browser; Enter on a select either opens or confirms —
                    // we only forward to next field when Tab is pressed with a value already selected
                    if (e.key === 'Tab' && !e.shiftKey) {
                      // let browser handle naturally — Branch is next in DOM
                    }
                  }}
                >
                  <option value="">{loadingCars ? 'Loading…' : 'Optional'}</option>
                  {cars.map((car) => (
                    <option key={car.id} value={car.name}>{car.name}</option>
                  ))}
                </select>
              </label>
 
              {/* 3. Branch dropdown — Tab moves to Advisor */}
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Branch <span className="font-normal text-slate-400">(optional)</span>
                <select
                  ref={branchRef}
                  className="kiosk-select !min-h-[36px] !py-1.5 !text-sm"
                  value={data.locationId}
                  onChange={(e) => set('locationId', e.target.value)}
                  disabled={loadingLocations}
                >
                  <option value="">{loadingLocations ? 'Loading…' : 'Select branch'}</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name || `Branch #${loc.id}`}</option>
                  ))}
                </select>
              </label>
 
              {/* 4. Sales Advisor dropdown — Tab moves to Remarks */}
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Sales Advisor <span className="font-normal text-slate-400">(optional)</span>
                <select
                  ref={advisorRef}
                  className="kiosk-select !min-h-[36px] !py-1.5 !text-sm"
                  value={data.salespersonId}
                  onChange={(e) => set('salespersonId', e.target.value)}
                  disabled={!data.locationId || loadingSP}
                >
                  <option value="">
                    {!data.locationId ? 'Select branch first' : loadingSP ? 'Loading…' : 'Select advisor'}
                  </option>
                  {salespersons.map((sp) => (
                    <option key={sp.id} value={sp.id}>{getDisplayName(sp)}</option>
                  ))}
                </select>
              </label>
 
              {/* 5. Remarks — Enter saves */}
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
                Remarks
                <input
                  ref={remarksRef}
                  type="text"
                  className="kiosk-input !min-h-[36px] !py-1.5 !text-sm"
                  placeholder="Optional · Enter to save"
                  value={data.remarks}
                  onChange={(e) => set('remarks', e.target.value)}
                  onKeyDown={handleRemarksKeyDown}
                />
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
  const [rawInput, setRawInput] = useState('');
  const [importError, setImportError] = useState('');
  const [rows, setRows] = useState([]);
  const [hasImported, setHasImported] = useState(false);
 
  const [cars, setCars] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);
 
  // Map of rowId → DOM ref for each row's Interested button
  // Stored in a ref (not state) so updates don't cause re-renders
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
    // Auto-focus the first row's Interested button once rendered
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
    setRows((prev) =>
      prev.map((r) => r.id === rowId ? { ...r, status, ...extra } : r)
    );
  }, []);
 
  // After a row is actioned, focus the next pending row's Interested button
  const focusNextPendingRow = useCallback((afterRowId) => {
    // Read latest rows via functional updater to avoid stale closure
    setRows((currentRows) => {
      const afterIndex = currentRows.findIndex((r) => r.id === afterRowId);
      const nextPending = currentRows.find(
        (r, i) => i > afterIndex && r.status === STATUS.PENDING
      );
      if (nextPending) {
        setTimeout(() => {
          interestedBtnRefs.current[nextPending.id]?.focus();
        }, 60);
      }
      return currentRows; // no state change, just reading
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
      const savedSummary = parts.join(' · ') || 'Saved to AI queue';
 
      setRowStatus(rowId, STATUS.SAVED, { savedSummary });
    } catch (error) {
      setRowStatus(rowId, STATUS.ERROR, {
        errorMessage: error?.message || 'Save failed. Try again.',
      });
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
 
      {/* Phase 1: Import */}
      {!hasImported ? (
        <div className="space-y-4">
          <label className="block text-lg font-semibold text-slate-700">
            Paste Mobile Numbers
            <p className="mt-0.5 text-sm font-normal text-slate-500">
              One per line, or separated by commas or spaces. Duplicates are removed automatically.
            </p>
            <textarea
              className="kiosk-input mt-2 min-h-[200px] font-mono text-base"
              placeholder={"9876543210\n9123456789\n9000000001"}
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                setImportError('');
              }}
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
              Tip: <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">Ctrl+Enter</kbd> to import
            </p>
            <button
              type="button"
              className="btn btn-primary px-8 h-14 rounded-2xl text-lg"
              onClick={handleImport}
              disabled={!rawInput.trim()}
            >
              Import Numbers
            </button>
          </div>
        </div>
      ) : (
        /* Phase 2: Table */
        <div className="space-y-3">
 
          {/* Keyboard legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> · next field</span>
            <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd> · move forward</span>
            <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">↑ ↓</kbd> · dropdown options</span>
            <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">U</kbd> · Uninterested</span>
            <span><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> on Remarks · Save &amp; next row</span>
          </div>
 
          {/* Summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 font-semibold">
                Total: {rows.length}
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 font-semibold">
                Pending: {counts.pending}
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-green-50 text-green-700 font-semibold">
                Saved: {counts.saved}
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 font-semibold">
                Uninterested: {counts.uninterested}
              </span>
            </div>
            <button
              type="button"
              className="btn border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 text-sm px-4 h-10 rounded-xl"
              onClick={handleReset}
            >
              ← New Import
            </button>
          </div>
 
          {/* Table */}
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
      )}
    </section>
  );
}