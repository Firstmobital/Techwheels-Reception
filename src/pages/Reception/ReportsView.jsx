import { useCallback, useEffect, useMemo, useState } from 'react';
import { getWalkinReports } from '../../services/walkinService';
import { getIVRReports, getIVRLeadsByRange } from '../../services/ivrReportService';

// ─── helpers ────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function tv(v) {
  const s = String(v ?? '').trim();
  return s || '—';
}

function spName(row) {
  return `${row?.salesperson?.first_name || ''} ${row?.salesperson?.last_name || ''}`.trim();
}

function fuelLabel(v) {
  const MAP = { PETROL: 'Petrol', DIESEL: 'Diesel', EV: 'EV', CNG: 'CNG' };
  if (!v) return '—';
  if (Array.isArray(v)) return v.map(f => MAP[f] || f).join(', ') || '—';
  return MAP[String(v).toUpperCase()] || v;
}

function normalizeCountEntries(map) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, variant }) {
  const cls = variant === 'warn'
    ? 'reports-kpi-badge reports-kpi-badge--warn'
    : 'reports-kpi-badge';
  return (
    <article className="reports-kpi">
      <p className="reports-kpi__label">{label}</p>
      <p className="reports-kpi__value">{value}</p>
      {sub && <span className={cls}>{sub}</span>}
    </article>
  );
}

function BarChart({ title, items, color }) {
  const max = items[0]?.count || 1;
  return (
    <article className="reports-card">
      <h3 className="reports-card__title">{title}</h3>
      {items.length === 0 && <p className="reports-empty">No data for this period.</p>}
      {items.map(({ label, count }) => (
        <div key={label} className="reports-bar-row">
          <span className="reports-bar-label" title={label}>{label || '—'}</span>
          <div className="reports-bar-track">
            <div
              className={`reports-bar-fill reports-bar-fill--${color}`}
              style={{ width: `${Math.round((count / max) * 100)}%` }}
            />
          </div>
          <span className="reports-bar-count">{count}</span>
        </div>
      ))}
    </article>
  );
}

function WalkinTable({ rows, branches, salespersons }) {
  const [filterSP, setFilterSP] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const sp = spName(r);
      const br = tv(r?.location?.name);
      return (filterSP === 'all' || sp === filterSP) &&
             (filterBranch === 'all' || br === filterBranch);
    });
  }, [rows, filterSP, filterBranch]);

  return (
    <>
      <div className="reports-table-filters">
        <select className="reports-select" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
          <option value="all">All branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="reports-select" value={filterSP} onChange={e => setFilterSP(e.target.value)}>
          <option value="all">All salespersons</option>
          {salespersons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="reports-row-count">{filtered.length} row{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Date</th><th>Time</th><th>Customer</th><th>Mobile</th>
              <th>Branch</th><th>Model</th><th>Fuel</th><th>Salesperson</th>
              <th>Purpose</th><th>Status</th><th>Opty</th><th>Token</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="reports-empty-cell">No walk-in records for this period.</td></tr>
            )}
            {filtered.map(row => {
              const optySubmitted = String(row.opty_status || '').toLowerCase() === 'submitted';
              return (
                <tr key={row.id}>
                  <td>{fmtDate(row.created_at)}</td>
                  <td>{fmtTime(row.created_at)}</td>
                  <td>{tv(row.customer_name)}</td>
                  <td>{tv(row.mobile_number)}</td>
                  <td>{tv(row?.location?.name)}</td>
                  <td>{tv(row?.car?.name)}</td>
                  <td>{fuelLabel(row.fuel_types ?? row.fuel_type)}</td>
                  <td>{tv(spName(row)) || 'Unassigned'}</td>
                  <td>{tv(row.purpose)}</td>
                  <td>
                    <span className={`reports-badge reports-badge--${row.status === 'assigned' ? 'green' : 'gray'}`}>
                      {tv(row.status)}
                    </span>
                  </td>
                  <td>
                    {optySubmitted
                      ? <span className="reports-badge reports-badge--blue">{tv(row.opty_id)}</span>
                      : <span className="reports-badge reports-badge--gray">{tv(row.opty_status) || 'pending'}</span>
                    }
                  </td>
                  <td>{tv(row.token_number)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function IVRTable({ rows, branches, salespersons }) {
  const [filterSP, setFilterSP] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const sp = spName(r);
      const br = tv(r?.location?.name);
      const rs = r.review_status || 'pending';
      return (filterSP === 'all' || sp === filterSP) &&
             (filterBranch === 'all' || br === filterBranch) &&
             (filterStatus === 'all' || rs === filterStatus);
    });
  }, [rows, filterSP, filterBranch, filterStatus]);

  return (
    <>
      <div className="reports-table-filters">
        <select className="reports-select" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
          <option value="all">All branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="reports-select" value={filterSP} onChange={e => setFilterSP(e.target.value)}>
          <option value="all">All salespersons</option>
          {salespersons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="reports-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="interested">Interested</option>
          <option value="uninterested">Uninterested</option>
        </select>
        <span className="reports-row-count">{filtered.length} row{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Date</th><th>Time</th><th>Customer</th><th>Mobile</th>
              <th>Branch</th><th>Model</th><th>Fuel</th><th>Salesperson</th>
              <th>Review status</th><th>Opty status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="reports-empty-cell">No IVR records for this period.</td></tr>
            )}
            {filtered.map(row => {
              const rs = row.review_status || 'pending';
              const rsBadge = rs === 'interested' ? 'green' : rs === 'uninterested' ? 'red' : 'amber';
              return (
                <tr key={row.id}>
                  <td>{fmtDate(row.created_at)}</td>
                  <td>{fmtTime(row.created_at)}</td>
                  <td>{tv(row.customer_name)}</td>
                  <td>{tv(row.mobile_number)}</td>
                  <td>{tv(row?.location?.name)}</td>
                  <td>{tv(row.model_name)}</td>
                  <td>{fuelLabel(row.fuel_type)}</td>
                  <td>{tv(spName(row)) || 'Unassigned'}</td>
                  <td><span className={`reports-badge reports-badge--${rsBadge}`}>{rs}</span></td>
                  <td><span className="reports-badge reports-badge--gray">{tv(row.opty_status) || 'pending'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CombinedTable({ walkinRows, ivrRows, branches, salespersons }) {
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterSP, setFilterSP] = useState('all');

  const allRows = useMemo(() => {
    const w = walkinRows.map(r => ({
      ...r, _source: 'walkin',
      _branch: tv(r?.location?.name),
      _sp: spName(r),
      _model: tv(r?.car?.name),
      _fuel: fuelLabel(r.fuel_types ?? r.fuel_type),
      _status: r.status,
    }));
    const iv = ivrRows.map(r => ({
      ...r, _source: 'ivr',
      _branch: tv(r?.location?.name),
      _sp: spName(r),
      _model: tv(r.model_name),
      _fuel: fuelLabel(r.fuel_type),
      _status: r.review_status || 'pending',
    }));
    return [...w, ...iv].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
  }, [walkinRows, ivrRows]);

  const filtered = useMemo(() => allRows.filter(r =>
    (filterBranch === 'all' || r._branch === filterBranch) &&
    (filterSP === 'all' || r._sp === filterSP)
  ), [allRows, filterBranch, filterSP]);

  return (
    <>
      <div className="reports-table-filters">
        <select className="reports-select" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
          <option value="all">All branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="reports-select" value={filterSP} onChange={e => setFilterSP(e.target.value)}>
          <option value="all">All salespersons</option>
          {salespersons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="reports-row-count">{filtered.length} row{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Date</th><th>Time</th><th>Source</th><th>Customer</th>
              <th>Mobile</th><th>Branch</th><th>Model</th><th>Fuel</th>
              <th>Salesperson</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="reports-empty-cell">No records for this period.</td></tr>
            )}
            {filtered.map(row => (
              <tr key={`${row._source}-${row.id}`}>
                <td>{fmtDate(row.created_at)}</td>
                <td>{fmtTime(row.created_at)}</td>
                <td>
                  <span className={`reports-badge reports-badge--${row._source === 'walkin' ? 'blue' : 'amber'}`}>
                    {row._source === 'walkin' ? 'Walk-in' : 'IVR'}
                  </span>
                </td>
                <td>{tv(row.customer_name)}</td>
                <td>{tv(row.mobile_number)}</td>
                <td>{row._branch}</td>
                <td>{row._model}</td>
                <td>{row._fuel}</td>
                <td>{tv(row._sp) || 'Unassigned'}</td>
                <td>
                  <span className={`reports-badge reports-badge--${
                    row._status === 'assigned' || row._status === 'interested' ? 'green'
                    : row._status === 'uninterested' ? 'red' : 'gray'
                  }`}>{row._status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── helpers: row-level fuel matching ────────────────────────────────────────

// Returns the canonical UPPERCASE fuel codes for a walkin row (handles both
// fuel_type string and fuel_types array).
function walkinFuelCodes(row) {
  const raw = row.fuel_types ?? row.fuel_type;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(f => String(f).toUpperCase().trim()).filter(Boolean);
  return String(raw).toUpperCase().split(',').map(f => f.trim()).filter(Boolean);
}

// Returns canonical UPPERCASE fuel code for an IVR row.
function ivrFuelCode(row) {
  return row.fuel_type ? String(row.fuel_type).toUpperCase().trim() : '';
}

// Returns model name for a walkin row.
function walkinModel(row) {
  return (row?.car?.name || '').trim();
}

// Returns model name for an IVR row.
function ivrModel(row) {
  return (row?.model_name || '').trim();
}

// ─── aggregation helpers (used after global filtering) ───────────────────────

function aggregateRows(rows, {
  getModel,
  getFuels,   // returns string[]
  getSP,
  getBranch,
  getPurpose, // optional
  getReviewStatus, // optional
}) {
  const modelCounts = new Map();
  const fuelCounts  = new Map();
  const spCounts    = new Map();
  const branchCounts = new Map();
  const purposeCounts = new Map();
  const reviewCounts = new Map();

  rows.forEach(r => {
    const model   = getModel(r)   || 'Unknown';
    const sp      = getSP(r)      || 'Unassigned';
    const branch  = getBranch(r)  || 'Unknown';
    const fuels   = getFuels(r);
    const purpose = getPurpose ? (getPurpose(r) || 'Unknown') : null;
    const rs      = getReviewStatus ? (getReviewStatus(r) || 'pending') : null;

    modelCounts.set(model,  (modelCounts.get(model)  || 0) + 1);
    spCounts.set(sp,        (spCounts.get(sp)         || 0) + 1);
    branchCounts.set(branch,(branchCounts.get(branch) || 0) + 1);

    if (fuels.length === 0) {
      fuelCounts.set('Unknown', (fuelCounts.get('Unknown') || 0) + 1);
    } else {
      fuels.forEach(f => fuelCounts.set(f, (fuelCounts.get(f) || 0) + 1));
    }
    if (purpose) purposeCounts.set(purpose, (purposeCounts.get(purpose) || 0) + 1);
    if (rs)      reviewCounts.set(rs, (reviewCounts.get(rs) || 0) + 1);
  });

  return {
    modelInterest:           normalizeCountEntries(modelCounts),
    fuelPreference:          normalizeCountEntries(fuelCounts),
    salespersonPerformance:  normalizeCountEntries(spCounts),
    branchBreakdown:         normalizeCountEntries(branchCounts),
    purposeBreakdown:        normalizeCountEntries(purposeCounts),
    reviewStatusBreakdown:   normalizeCountEntries(reviewCounts),
  };
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ReportsView() {
  const [source, setSource] = useState('combined'); // 'walkin' | 'ivr' | 'combined'
  const [filterType, setFilterType] = useState('today');
  const [customStartDate, setCustomStartDate] = useState(today());
  const [customEndDate, setCustomEndDate] = useState(today());
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'table'

  // Global dimension filters (applied to KPIs + charts + tables)
  const [filterModel, setFilterModel] = useState('all');
  const [filterFuel,  setFilterFuel]  = useState('all');

  const [walkinReport, setWalkinReport] = useState(null);
  const [ivrReport, setIvrReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const opts = { filterType, customStartDate, customEndDate };
      const walkinOpts = { filterType, customDate: customStartDate };
      const [w, iv] = await Promise.all([
        getWalkinReports(walkinOpts),
        getIVRReports(opts),
      ]);
      setWalkinReport(w);
      setIvrReport(iv);
    } catch (err) {
      setError(err?.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, [filterType, customStartDate, customEndDate]);

  useEffect(() => { load(); }, [load]);

  // ── Build option lists for global model/fuel dropdowns ──────────────────
  const allModelOptions = useMemo(() => {
    const models = new Set();
    (walkinReport?.rows || []).forEach(r => { const m = walkinModel(r); if (m) models.add(m); });
    (ivrReport?.rows    || []).forEach(r => { const m = ivrModel(r);    if (m) models.add(m); });
    return [...models].sort();
  }, [walkinReport, ivrReport]);

  const allFuelOptions = useMemo(() => {
    const fuels = new Set();
    (walkinReport?.rows || []).forEach(r => walkinFuelCodes(r).forEach(f => fuels.add(f)));
    (ivrReport?.rows    || []).forEach(r => { const f = ivrFuelCode(r); if (f) fuels.add(f); });
    return [...fuels].sort();
  }, [walkinReport, ivrReport]);

  // Friendly label for a fuel code in the dropdown
  const FUEL_DISPLAY = { PETROL: 'Petrol', DIESEL: 'Diesel', EV: 'EV', CNG: 'CNG' };

  // ── Apply global model + fuel filters to raw rows ───────────────────────
  const filteredWalkinRows = useMemo(() => {
    if (!walkinReport) return [];
    return walkinReport.rows.filter(r => {
      const modelMatch = filterModel === 'all' || walkinModel(r).toLowerCase() === filterModel.toLowerCase();
      const fuelMatch  = filterFuel  === 'all' || walkinFuelCodes(r).includes(filterFuel.toUpperCase());
      return modelMatch && fuelMatch;
    });
  }, [walkinReport, filterModel, filterFuel]);

  const filteredIvrRows = useMemo(() => {
    if (!ivrReport) return [];
    return ivrReport.rows.filter(r => {
      const modelMatch = filterModel === 'all' || ivrModel(r).toLowerCase() === filterModel.toLowerCase();
      const fuelMatch  = filterFuel  === 'all' || ivrFuelCode(r) === filterFuel.toUpperCase();
      return modelMatch && fuelMatch;
    });
  }, [ivrReport, filterModel, filterFuel]);

  // ── Re-aggregate breakdowns from filtered rows ───────────────────────────
  const walkinAgg = useMemo(() => aggregateRows(filteredWalkinRows, {
    getModel:   walkinModel,
    getFuels:   walkinFuelCodes,
    getSP:      r => spName(r),
    getBranch:  r => (r?.location?.name || '').trim(),
    getPurpose: r => (r?.purpose || '').trim(),
  }), [filteredWalkinRows]);

  const ivrAgg = useMemo(() => aggregateRows(filteredIvrRows, {
    getModel:         ivrModel,
    getFuels:         r => { const f = ivrFuelCode(r); return f ? [f] : []; },
    getSP:            r => spName(r),
    getBranch:        r => (r?.location?.name || '').trim(),
    getReviewStatus:  r => r.review_status || 'pending',
  }), [filteredIvrRows]);

  // ── Build active slice (per source tab) ─────────────────────────────────
  const active = useMemo(() => {
    if (!walkinReport || !ivrReport) return null;

    if (source === 'walkin') return {
      total: filteredWalkinRows.length,
      sub: null,
      ...walkinAgg,
    };
    if (source === 'ivr') return {
      total: filteredIvrRows.length,
      sub: null,
      ...ivrAgg,
    };

    // Combined: merge aggregations
    function merge(a = [], b = []) {
      const m = new Map();
      [...a, ...b].forEach(({ label, count }) => m.set(label, (m.get(label) || 0) + count));
      return normalizeCountEntries(m);
    }
    const totalW = filteredWalkinRows.length;
    const totalI = filteredIvrRows.length;
    return {
      total: totalW + totalI,
      sub: `Walk-ins: ${totalW}  ·  IVR: ${totalI}`,
      modelInterest:          merge(walkinAgg.modelInterest, ivrAgg.modelInterest),
      fuelPreference:         merge(walkinAgg.fuelPreference, ivrAgg.fuelPreference),
      salespersonPerformance: merge(walkinAgg.salespersonPerformance, ivrAgg.salespersonPerformance),
      branchBreakdown:        merge(walkinAgg.branchBreakdown, ivrAgg.branchBreakdown),
      purposeBreakdown:       walkinAgg.purposeBreakdown,
      reviewStatusBreakdown:  ivrAgg.reviewStatusBreakdown,
    };
  }, [source, walkinReport, ivrReport, filteredWalkinRows, filteredIvrRows, walkinAgg, ivrAgg]);

  // ── Options for within-table dropdowns (branch + salesperson) ───────────
  const walkinBranches = useMemo(() =>
    [...new Set(filteredWalkinRows.map(r => tv(r?.location?.name)).filter(v => v !== '—'))].sort(),
  [filteredWalkinRows]);
  const walkinSPs = useMemo(() =>
    [...new Set(filteredWalkinRows.map(r => spName(r)).filter(Boolean))].sort(),
  [filteredWalkinRows]);
  const ivrBranches = useMemo(() =>
    [...new Set(filteredIvrRows.map(r => tv(r?.location?.name)).filter(v => v !== '—'))].sort(),
  [filteredIvrRows]);
  const ivrSPs = useMemo(() =>
    [...new Set(filteredIvrRows.map(r => spName(r)).filter(Boolean))].sort(),
  [filteredIvrRows]);
  const allBranches = useMemo(() => [...new Set([...walkinBranches, ...ivrBranches])].sort(), [walkinBranches, ivrBranches]);
  const allSPs      = useMemo(() => [...new Set([...walkinSPs, ...ivrSPs])].sort(), [walkinSPs, ivrSPs]);

  // ── KPI extras ───────────────────────────────────────────────────────────
  const topModel = active?.modelInterest?.[0];
  const topSP    = active?.salespersonPerformance?.find(s => s.label !== 'Unassigned') ?? active?.salespersonPerformance?.[0];

  const optyCount = useMemo(() => {
    const w  = filteredWalkinRows.filter(r => String(r.opty_status || '').toLowerCase() === 'submitted').length;
    const iv = filteredIvrRows.filter(r => String(r.opty_status || '').toLowerCase() === 'submitted').length;
    return source === 'walkin' ? w : source === 'ivr' ? iv : w + iv;
  }, [source, filteredWalkinRows, filteredIvrRows]);

  const pendingIVR = useMemo(() =>
    filteredIvrRows.filter(r => (r.review_status || 'pending') === 'pending').length,
  [filteredIvrRows]);

  // Active filter label shown in the header
  const activeFilterLabel = useMemo(() => {
    const parts = [];
    if (filterModel !== 'all') parts.push(filterModel);
    if (filterFuel  !== 'all') parts.push(FUEL_DISPLAY[filterFuel] || filterFuel);
    return parts.length ? parts.join(' · ') : null;
  }, [filterModel, filterFuel]);

  return (
    <section className="panel reports-view">

      {/* ── Page header ── */}
      <header className="reports-header">
        <div>
          <h1 className="reports-title">Reports</h1>
          <p className="reports-subtitle">Walk-in and IVR lead analytics across all branches</p>
        </div>
        <div className="reports-source-tabs">
          {[
            { key: 'walkin', label: 'Walk-ins' },
            { key: 'ivr', label: 'IVR leads' },
            { key: 'combined', label: 'Combined' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`reports-stab${source === key ? ' reports-stab--active' : ''}`}
              onClick={() => setSource(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Date filter chips ── */}
      <div className="reports-filter-chips">
        {[
          { key: 'today', label: 'Today' },
          { key: 'thisWeek', label: 'This week' },
          { key: 'thisMonth', label: 'This month' },
          { key: 'custom', label: 'Custom range' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`reports-chip${filterType === key ? ' reports-chip--active' : ''}`}
            onClick={() => setFilterType(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Custom date range ── */}
      {filterType === 'custom' && (
        <div className="reports-custom-range">
          <label className="reports-date-label">From</label>
          <input
            type="date"
            className="reports-date-input"
            value={customStartDate}
            max={today()}
            onChange={e => setCustomStartDate(e.target.value)}
          />
          <label className="reports-date-label">To</label>
          <input
            type="date"
            className="reports-date-input"
            value={customEndDate}
            min={customStartDate}
            max={today()}
            onChange={e => setCustomEndDate(e.target.value)}
          />
        </div>
      )}

      {/* ── Global dimension filters: model + fuel ── */}
      {!loading && active && (
        <div className="reports-dim-filters">
          <select
            className="reports-select"
            value={filterModel}
            onChange={e => setFilterModel(e.target.value)}
          >
            <option value="all">All models</option>
            {allModelOptions.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            className="reports-select"
            value={filterFuel}
            onChange={e => setFilterFuel(e.target.value)}
          >
            <option value="all">All fuel types</option>
            {allFuelOptions.map(f => (
              <option key={f} value={f}>{FUEL_DISPLAY[f] || f}</option>
            ))}
          </select>

          {activeFilterLabel && (
            <span className="reports-active-filter">
              {activeFilterLabel}
              <button
                type="button"
                className="reports-clear-filter"
                onClick={() => { setFilterModel('all'); setFilterFuel('all'); }}
                title="Clear filters"
              >
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      {error && <p className="error-text" style={{ marginTop: '0.75rem' }}>{error}</p>}

      {loading ? (
        <p className="reports-loading">Loading reports…</p>
      ) : active ? (
        <>
          {/* ── KPI strip ── */}
          <div className="reports-kpi-grid">
            <KpiCard
              label="Total enquiries"
              value={active.total}
              sub={active.sub}
            />
            <KpiCard
              label="Opty submitted"
              value={optyCount}
              sub={`${active.total > 0 ? Math.round((optyCount / active.total) * 100) : 0}% conversion`}
            />
            {source !== 'walkin' && (
              <KpiCard
                label="IVR pending review"
                value={pendingIVR}
                variant={pendingIVR > 0 ? 'warn' : undefined}
                sub={pendingIVR > 0 ? 'needs action' : 'all clear'}
              />
            )}
            <KpiCard
              label="Top model"
              value={topModel?.label || '—'}
              sub={topModel ? `${topModel.count} enquirie${topModel.count !== 1 ? 's' : ''}` : null}
            />
            <KpiCard
              label="Top salesperson"
              value={topSP?.label || '—'}
              sub={topSP ? `${topSP.count} assigned` : null}
            />
          </div>

          {/* ── View toggle ── */}
          <div className="reports-view-toggle">
            <button
              type="button"
              className={`report-filter-btn${viewMode === 'summary' ? ' active' : ''}`}
              onClick={() => setViewMode('summary')}
            >
              Summary
            </button>
            <button
              type="button"
              className={`report-filter-btn${viewMode === 'table' ? ' active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table view
            </button>
          </div>

          {/* ── Summary: bar charts ── */}
          {viewMode === 'summary' && (
            <div className="reports-charts-grid">
              <BarChart title="By branch" items={active.branchBreakdown ?? []} color="blue" />
              <BarChart title="By model" items={active.modelInterest ?? []} color="purple" />
              <BarChart title="By fuel type" items={active.fuelPreference ?? []} color="amber" />
              <BarChart title="By salesperson" items={active.salespersonPerformance ?? []} color="coral" />
              {source !== 'ivr' && active.purposeBreakdown?.length > 0 && (
                <BarChart title="By purpose (walk-ins)" items={active.purposeBreakdown} color="teal" />
              )}
              {source !== 'walkin' && active.reviewStatusBreakdown?.length > 0 && (
                <BarChart title="IVR review status" items={active.reviewStatusBreakdown} color="green" />
              )}
            </div>
          )}

          {/* ── Table view ── */}
          {viewMode === 'table' && (
            <div className="reports-card reports-card--full">
              {source === 'walkin' && (
                <WalkinTable
                  rows={filteredWalkinRows}
                  branches={walkinBranches}
                  salespersons={walkinSPs}
                />
              )}
              {source === 'ivr' && (
                <IVRTable
                  rows={filteredIvrRows}
                  branches={ivrBranches}
                  salespersons={ivrSPs}
                />
              )}
              {source === 'combined' && (
                <CombinedTable
                  walkinRows={filteredWalkinRows}
                  ivrRows={filteredIvrRows}
                  branches={allBranches}
                  salespersons={allSPs}
                />
              )}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
