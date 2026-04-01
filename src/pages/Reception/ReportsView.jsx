import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWalkinReports } from '../../services/walkinService';
import { getIVRReports, getIVRLeadsByRange } from '../../services/ivrReportService';
import { getConversionReport } from '../../services/conversionReportService';

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
              <th>Purpose</th><th>Opty ID</th><th>Opty</th><th>Token</th>
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
                  <td>{tv(row.opty_id)}</td>
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
              <th>Opty ID</th><th>Opty status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="reports-empty-cell">No IVR records for this period.</td></tr>
            )}
            {filtered.map(row => {
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
                  <td>{tv(row.opty_id)}</td>
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
      _optyId: r.opty_id,
    }));
    const iv = ivrRows.map(r => ({
      ...r, _source: 'ivr',
      _branch: tv(r?.location?.name),
      _sp: spName(r),
      _model: tv(r.model_name),
      _fuel: fuelLabel(r.fuel_type),
      _optyId: r.opty_id,
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
              <th>Salesperson</th><th>Opty ID</th>
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
                <td>{tv(row._optyId)}</td>
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
  const modelFuelCounts = new Map();
  const spCounts    = new Map();
  const branchCounts = new Map();
  const purposeCounts = new Map();
  const reviewCounts = new Map();

  const FUEL_LABEL = { PETROL: 'Petrol', DIESEL: 'Diesel', EV: 'EV', CNG: 'CNG' };

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
      const key = model === 'Unknown' ? 'Unknown' : model;
      modelFuelCounts.set(key, (modelFuelCounts.get(key) || 0) + 1);
    } else {
      fuels.forEach(f => {
        fuelCounts.set(f, (fuelCounts.get(f) || 0) + 1);
        const fLabel = FUEL_LABEL[f] || f;
        const key = model === 'Unknown' ? `Unknown (${fLabel})` : `${model} ${fLabel}`;
        modelFuelCounts.set(key, (modelFuelCounts.get(key) || 0) + 1);
      });
    }
    if (purpose) purposeCounts.set(purpose, (purposeCounts.get(purpose) || 0) + 1);
    if (rs)      reviewCounts.set(rs, (reviewCounts.get(rs) || 0) + 1);
  });

  return {
    modelInterest:           normalizeCountEntries(modelCounts),
    fuelPreference:          normalizeCountEntries(fuelCounts),
    modelFuelBreakdown:      normalizeCountEntries(modelFuelCounts),
    salespersonPerformance:  normalizeCountEntries(spCounts),
    branchBreakdown:         normalizeCountEntries(branchCounts),
    purposeBreakdown:        normalizeCountEntries(purposeCounts),
    reviewStatusBreakdown:   normalizeCountEntries(reviewCounts),
  };
}

// ─── conversion report components ────────────────────────────────────────────

/**
 * Re-derives conversion metrics from already-filtered walkin + ivr rows,
 * using the set of converted opty_ids fetched by the service.
 * This makes the Conversion tab respond to the global dimension filters.
 */
function computeConversionFromRows(walkinRows, ivrRows, conversionReport) {
  if (!conversionReport) return null;

  // Use the booking-match set returned by the service.
  // A row is converted only if its opty_id appears in the booking table (crm_opty_id match).
  const convertedOptyIds = conversionReport.convertedOptyIds || new Set();
  const isConverted = (row) => Boolean(row.opty_id && convertedOptyIds.has(row.opty_id));

  const taggedWalkins = walkinRows.map(r => ({
    ...r,
    _source: 'walkin',
    _converted: isConverted(r),
    _agentName: spName(r) || 'Unassigned',
    _branchName: (r?.location?.name || '').trim() || 'Unknown',
  }));

  const taggedIvrs = ivrRows.map(r => ({
    ...r,
    _source: 'ivr',
    _converted: isConverted(r),
    _agentName: spName(r) || 'Unassigned',
    _branchName: (r?.location?.name || '').trim() || 'Unknown',
  }));

  const allRows = [...taggedWalkins, ...taggedIvrs];
  const totalLeads     = allRows.length;
  const totalConverted = allRows.filter(r => r._converted).length;
  const totalLost      = allRows.filter(r => r.opty_id && !r._converted).length;
  const convRate       = totalLeads > 0 ? ((totalConverted / totalLeads) * 100).toFixed(1) : '0.0';

  // Source breakdown
  const walkinConverted = taggedWalkins.filter(r => r._converted).length;
  const ivrConverted    = taggedIvrs.filter(r => r._converted).length;
  const sourceBreakdown = {
    walkin: {
      total:     taggedWalkins.length,
      converted: walkinConverted,
      lost:      taggedWalkins.filter(r => r.opty_id && !r._converted).length,
      rate:      taggedWalkins.length > 0 ? Math.round((walkinConverted / taggedWalkins.length) * 100) : 0,
    },
    ivr: {
      total:     taggedIvrs.length,
      converted: ivrConverted,
      lost:      taggedIvrs.filter(r => r.opty_id && !r._converted).length,
      rate:      taggedIvrs.length > 0 ? Math.round((ivrConverted / taggedIvrs.length) * 100) : 0,
    },
  };

  // Agent performance
  const agentMap = new Map();
  allRows.forEach(r => {
    const key = r._agentName;
    if (!agentMap.has(key)) agentMap.set(key, { leads: 0, converted: 0 });
    const entry = agentMap.get(key);
    entry.leads++;
    if (r._converted) entry.converted++;
  });
  const agentPerformance = [...agentMap.entries()]
    .map(([agent, { leads, converted }]) => ({
      agent, leads, converted,
      rate: leads > 0 ? Math.round((converted / leads) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.leads - a.leads);

  // Branch conversion
  const branchMap = new Map();
  allRows.forEach(r => {
    const key = r._branchName;
    if (!branchMap.has(key)) branchMap.set(key, { walkins: 0, ivr: 0, converted: 0 });
    const entry = branchMap.get(key);
    if (r._source === 'walkin') entry.walkins++;
    else entry.ivr++;
    if (r._converted) entry.converted++;
  });
  const branchConversion = [...branchMap.entries()]
    .map(([branch, { walkins: w, ivr, converted }]) => {
      const total = w + ivr;
      return { branch, total, walkins: w, ivr, converted, rate: total > 0 ? Math.round((converted / total) * 100) : 0 };
    })
    .sort((a, b) => b.total - a.total);

  // Daily trend
  const dailyMap = new Map();
  allRows.forEach(r => {
    const day = (r.created_at || '').slice(0, 10);
    if (!day) return;
    if (!dailyMap.has(day)) dailyMap.set(day, { total: 0, converted: 0 });
    const entry = dailyMap.get(day);
    entry.total++;
    if (r._converted) entry.converted++;
  });
  const dailyTrend = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, converted }]) => ({ date, total, converted }));

  // Hourly trend
  const hourlyMap = new Map();
  allRows.forEach(r => {
    const d = new Date(r.created_at);
    if (isNaN(d)) return;
    const h = d.getHours();
    if (!hourlyMap.has(h)) hourlyMap.set(h, { walkin: 0, ivr: 0 });
    const entry = hourlyMap.get(h);
    if (r._source === 'walkin') entry.walkin++;
    else entry.ivr++;
  });
  const hourlyTrend = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`,
    walkin: hourlyMap.get(h)?.walkin || 0,
    ivr:    hourlyMap.get(h)?.ivr    || 0,
  }));

  return { totalLeads, totalConverted, totalLost, convRate, sourceBreakdown, agentPerformance, branchConversion, dailyTrend, hourlyTrend };
}



function BusinessOutcomes({ data }) {
  if (!data) return null;
  const { totalLeads, totalConverted, totalLost, convRate, sourceBreakdown } = data;
  const walkinRate = sourceBreakdown?.walkin?.rate ?? 0;
  const ivrRate    = sourceBreakdown?.ivr?.rate    ?? 0;
  const bestSource = walkinRate >= ivrRate ? 'Walk-in' : 'IVR';
  const diff       = Math.abs(walkinRate - ivrRate);

  return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Business outcomes</h3>
      <div className="conv-outcomes-grid">
        <div className="conv-outcome">
          <p className="conv-outcome__label">Total leads</p>
          <p className="conv-outcome__value">{totalLeads.toLocaleString()}</p>
        </div>
        <div className="conv-outcome">
          <p className="conv-outcome__label">Converted</p>
          <p className="conv-outcome__value conv-outcome__value--green">{totalConverted.toLocaleString()}</p>
        </div>
        <div className="conv-outcome">
          <p className="conv-outcome__label">Conversion rate</p>
          <p className="conv-outcome__value">{convRate}%</p>
        </div>
        <div className="conv-outcome">
          <p className="conv-outcome__label">Lost / no opty</p>
          <p className="conv-outcome__value conv-outcome__value--red">{totalLost.toLocaleString()}</p>
        </div>
      </div>

      {/* Source breakdown */}
      <div style={{ marginTop: '1.25rem' }}>
        <p className="conv-sub-title">Source breakdown</p>
        {[
          { key: 'walkin', label: 'Walk-in', color: '#2563eb', d: sourceBreakdown?.walkin },
          { key: 'ivr',    label: 'IVR / Call', color: '#d97706', d: sourceBreakdown?.ivr },
        ].map(({ label, color, d }) => {
          if (!d) return null;
          const pct = totalLeads > 0 ? Math.round((d.total / totalLeads) * 100) : 0;
          const barPct = (sourceBreakdown?.walkin?.total + sourceBreakdown?.ivr?.total) > 0
            ? Math.round((d.total / (sourceBreakdown.walkin.total + sourceBreakdown.ivr.total)) * 100)
            : 0;
          return (
            <div key={label} style={{ marginBottom: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{label}</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{d.total.toLocaleString()} <span style={{ color: '#888', fontWeight: 400 }}>{pct}%</span></span>
              </div>
              <div className="reports-bar-track" style={{ height: 9 }}>
                <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 999, minWidth: d.total > 0 ? 3 : 0 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.78rem', color: '#666' }}>
                <span>Conv: {d.converted} ({d.rate}%)</span>
                <span>Lost: {d.lost}</span>
              </div>
            </div>
          );
        })}
        {diff > 0 && (
          <div className="conv-best-badge">
            {bestSource} +{diff}pp over {bestSource === 'Walk-in' ? 'IVR' : 'Walk-in'}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentPerformanceTable({ data }) {
  if (!data?.agentPerformance?.length) return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Agent performance</h3>
      <p className="reports-empty">No agent data for this period.</p>
    </div>
  );

  const rows = data.agentPerformance;
  const maxRate = Math.max(...rows.map(r => r.rate), 1);

  return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Agent performance</h3>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th style={{ textAlign: 'right' }}>Leads</th>
              <th style={{ textAlign: 'right' }}>Conv.</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rateColor = r.rate >= 25 ? '#16a34a' : r.rate >= 15 ? '#d97706' : '#dc2626';
              return (
                <tr key={r.agent}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="conv-rank">{i + 1}</span>
                      {r.agent}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.leads}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.converted}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="reports-bar-track" style={{ flex: 1, height: 6 }}>
                        <div style={{ height: '100%', width: `${Math.round((r.rate / maxRate) * 100)}%`, background: rateColor, borderRadius: 999 }} />
                      </div>
                      <span style={{ color: rateColor, fontWeight: 700, fontSize: '0.82rem', minWidth: 36 }}>{r.rate}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BranchConversionTable({ data }) {
  if (!data?.branchConversion?.length) return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Branch conversion</h3>
      <p className="reports-empty">No branch data for this period.</p>
    </div>
  );

  const rows = data.branchConversion;

  return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Branch conversion</h3>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Walk-ins</th>
              <th style={{ textAlign: 'right' }}>IVR</th>
              <th style={{ textAlign: 'right' }}>Converted</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const rateColor = r.rate >= 25 ? '#16a34a' : r.rate >= 15 ? '#d97706' : '#dc2626';
              return (
                <tr key={r.branch}>
                  <td style={{ fontWeight: 600 }}>{r.branch}</td>
                  <td style={{ textAlign: 'right' }}>{r.total}</td>
                  <td style={{ textAlign: 'right' }}>{r.walkins}</td>
                  <td style={{ textAlign: 'right' }}>{r.ivr}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.converted}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: rateColor, fontWeight: 700 }}>{r.rate}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyTrendChart({ data }) {
  if (!data?.dailyTrend?.length) return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Daily lead trend</h3>
      <p className="reports-empty">No daily data for this period.</p>
    </div>
  );

  const rows = data.dailyTrend;
  const maxVal = Math.max(...rows.map(r => r.total), 1);
  const avg = rows.length > 0 ? (rows.reduce((s, r) => s + r.total, 0) / rows.length).toFixed(1) : 0;
  const peak = [...rows].sort((a, b) => b.total - a.total)[0];
  const lowest = [...rows].sort((a, b) => a.total - b.total)[0];
  const today_ = new Date().toISOString().slice(0, 10);

  function shortDate(iso) {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Daily lead trend</h3>
      <div className="daily-chart">
        {rows.map(r => {
          const heightPct = Math.max(Math.round((r.total / maxVal) * 100), r.total > 0 ? 4 : 0);
          const isToday = r.date === today_;
          return (
            <div key={r.date} className="daily-bar-wrap" title={`${shortDate(r.date)}: ${r.total} leads`}>
              <div className="daily-bar-col">
                <div
                  className={`daily-bar${isToday ? ' daily-bar--today' : ''}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="daily-axis">
        <span>{rows[0] ? shortDate(rows[0].date) : ''}</span>
        <span>{rows[rows.length - 1] ? shortDate(rows[rows.length - 1].date) : ''}</span>
      </div>
      <div className="daily-stats">
        <span><span className="daily-stat-label">Daily avg</span> <strong>{avg}</strong></span>
        {peak && <span><span className="daily-stat-label">Peak day</span> <strong>{shortDate(peak.date)} — {peak.total}</strong></span>}
        {lowest && lowest.date !== peak?.date && <span><span className="daily-stat-label">Lowest</span> <strong>{shortDate(lowest.date)} — {lowest.total}</strong></span>}
      </div>
    </div>
  );
}

function HourlyTrendChart({ data }) {
  if (!data?.hourlyTrend) return null;

  // Only show hours 7AM–7PM (7–19), trim empty ends
  const slots = data.hourlyTrend.filter(h => h.hour >= 7 && h.hour <= 19);
  const maxVal = Math.max(...slots.map(h => h.walkin + h.ivr), 1);

  const CHART_H = 120;

  function yFor(val) {
    return CHART_H - Math.round((val / maxVal) * CHART_H);
  }

  // Build SVG polyline points
  function pts(key) {
    return slots.map((h, i) => {
      const x = 40 + Math.round((i / (slots.length - 1)) * (600 - 40));
      const y = 10 + yFor(h[key]);
      return `${x},${y}`;
    }).join(' ');
  }

  const walkinPts = pts('walkin');
  const ivrPts    = pts('ivr');

  return (
    <div className="reports-card reports-card--full conv-section">
      <h3 className="reports-card__title">Lead volume — hourly</h3>
      <div className="hourly-legend">
        <span className="hourly-dot hourly-dot--blue" /> Walk-in
        <span className="hourly-dot hourly-dot--amber" style={{ marginLeft: 16 }} /> IVR
      </div>
      <svg viewBox="0 0 640 160" width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = 10 + Math.round(f * CHART_H);
          return <line key={f} x1="36" y1={y} x2="604" y2={y} stroke="#e2e8f0" strokeWidth="0.5" />;
        })}
        {/* Y-axis labels */}
        {[0, 0.5, 1].map(f => {
          const y = 10 + Math.round(f * CHART_H);
          const val = Math.round(maxVal * (1 - f));
          return <text key={f} x="30" y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{val}</text>;
        })}
        {/* Walk-in line */}
        <polyline points={walkinPts} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
        {slots.map((h, i) => {
          const x = 40 + Math.round((i / (slots.length - 1)) * 560);
          const y = 10 + yFor(h.walkin);
          return <circle key={i} cx={x} cy={y} r="3.5" fill="#2563eb" />;
        })}
        {/* IVR line */}
        <polyline points={ivrPts} fill="none" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
        {slots.map((h, i) => {
          const x = 40 + Math.round((i / (slots.length - 1)) * 560);
          const y = 10 + yFor(h.ivr);
          return <circle key={i} cx={x} cy={y} r="3.5" fill="#d97706" />;
        })}
        {/* X-axis labels */}
        {slots.map((h, i) => {
          if (i % 2 !== 0) return null;
          const x = 40 + Math.round((i / (slots.length - 1)) * 560);
          return <text key={h.hour} x={x} y={148} textAnchor="middle" fontSize="10" fill="#94a3b8">{h.label}</text>;
        })}
      </svg>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ReportsView() {
  const [source, setSource] = useState('combined'); // 'walkin' | 'ivr' | 'combined'
  const [filterType, setFilterType] = useState('today');
  const [customStartDate, setCustomStartDate] = useState(today());
  const [customEndDate, setCustomEndDate] = useState(today());
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'table'

  // Global dimension filters (applied to KPIs + charts + tables)
  const [filterModel,  setFilterModel]  = useState('all');
  const [filterFuel,   setFilterFuel]   = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterSP,     setFilterSP]     = useState('all');

  const [walkinReport, setWalkinReport] = useState(null);
  const [ivrReport, setIvrReport] = useState(null);
  const [conversionReport, setConversionReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const opts = { filterType, customStartDate, customEndDate };
      const walkinOpts = { filterType, customStartDate, customEndDate };
      const [w, iv, conv] = await Promise.all([
        getWalkinReports(walkinOpts),
        getIVRReports(opts),
        getConversionReport(opts),
      ]);
      setWalkinReport(w);
      setIvrReport(iv);
      setConversionReport(conv);
    } catch (err) {
      setError(err?.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, [filterType, customStartDate, customEndDate]);

  useEffect(() => { load(); }, [load]);

  // ── Build option lists for global model/fuel/branch/SP dropdowns ──────────
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

  const allBranchOptions = useMemo(() => {
    const branches = new Set();
    (walkinReport?.rows || []).forEach(r => { const b = (r?.location?.name || '').trim(); if (b) branches.add(b); });
    (ivrReport?.rows    || []).forEach(r => { const b = (r?.location?.name || '').trim(); if (b) branches.add(b); });
    return [...branches].sort();
  }, [walkinReport, ivrReport]);

  const allSPOptions = useMemo(() => {
    const sps = new Set();
    (walkinReport?.rows || []).forEach(r => { const s = spName(r); if (s) sps.add(s); });
    (ivrReport?.rows    || []).forEach(r => { const s = spName(r); if (s) sps.add(s); });
    return [...sps].sort();
  }, [walkinReport, ivrReport]);

  // Friendly label for a fuel code in the dropdown
  const FUEL_DISPLAY = { PETROL: 'Petrol', DIESEL: 'Diesel', EV: 'EV', CNG: 'CNG' };

  // ── Apply global model + fuel filters to raw rows ───────────────────────
  const filteredWalkinRows = useMemo(() => {
    if (!walkinReport) return [];
    return walkinReport.rows.filter(r => {
      const modelMatch  = filterModel  === 'all' || walkinModel(r).toLowerCase() === filterModel.toLowerCase();
      const fuelMatch   = filterFuel   === 'all' || walkinFuelCodes(r).includes(filterFuel.toUpperCase());
      const branchMatch = filterBranch === 'all' || (r?.location?.name || '').trim() === filterBranch;
      const spMatch     = filterSP     === 'all' || spName(r) === filterSP;
      return modelMatch && fuelMatch && branchMatch && spMatch;
    });
  }, [walkinReport, filterModel, filterFuel, filterBranch, filterSP]);

  const filteredIvrRows = useMemo(() => {
    if (!ivrReport) return [];
    return ivrReport.rows.filter(r => {
      const modelMatch  = filterModel  === 'all' || ivrModel(r).toLowerCase() === filterModel.toLowerCase();
      const fuelMatch   = filterFuel   === 'all' || ivrFuelCode(r) === filterFuel.toUpperCase();
      const branchMatch = filterBranch === 'all' || (r?.location?.name || '').trim() === filterBranch;
      const spMatch     = filterSP     === 'all' || spName(r) === filterSP;
      return modelMatch && fuelMatch && branchMatch && spMatch;
    });
  }, [ivrReport, filterModel, filterFuel, filterBranch, filterSP]);

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
      modelFuelBreakdown:     merge(walkinAgg.modelFuelBreakdown, ivrAgg.modelFuelBreakdown),
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

  // ── Conversion report re-derived from filtered rows ─────────────────────
  // This makes the Conversion tab respond to the global dimension filters
  // (model, fuel, branch, salesperson) just like Summary and Table views.
  const filteredConversionReport = useMemo(() => {
    if (!conversionReport) return null;
    // Use source filter to decide which rows feed into conversion
    const wRows = source === 'ivr' ? [] : filteredWalkinRows;
    const iRows = source === 'walkin' ? [] : filteredIvrRows;
    return computeConversionFromRows(wRows, iRows, conversionReport);
  }, [conversionReport, filteredWalkinRows, filteredIvrRows, source]);

  const pendingIVR = useMemo(() =>
    filteredIvrRows.filter(r => (r.review_status || 'pending') === 'pending').length,
  [filteredIvrRows]);

  // Active filter label shown in the header
  const activeFilterLabel = useMemo(() => {
    const parts = [];
    if (filterModel  !== 'all') parts.push(filterModel);
    if (filterFuel   !== 'all') parts.push(FUEL_DISPLAY[filterFuel] || filterFuel);
    if (filterBranch !== 'all') parts.push(filterBranch);
    if (filterSP     !== 'all') parts.push(filterSP);
    return parts.length ? parts.join(' · ') : null;
  }, [filterModel, filterFuel, filterBranch, filterSP]);

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

      {/* ── Global dimension filters: model + fuel + branch + salesperson ── */}
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

          <select
            className="reports-select"
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}
          >
            <option value="all">All branches</option>
            {allBranchOptions.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <select
            className="reports-select"
            value={filterSP}
            onChange={e => setFilterSP(e.target.value)}
          >
            <option value="all">All salespersons</option>
            {allSPOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {activeFilterLabel && (
            <span className="reports-active-filter">
              {activeFilterLabel}
              <button
                type="button"
                className="reports-clear-filter"
                onClick={() => { setFilterModel('all'); setFilterFuel('all'); setFilterBranch('all'); setFilterSP('all'); }}
                title="Clear all filters"
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
              label="Converted"
              value={filteredConversionReport?.totalConverted ?? 0}
              sub={`${filteredConversionReport?.convRate ?? '0.0'}% conversion rate`}
            />
            {source !== 'walkin' && (
              <KpiCard
                label="IVR pending review"
                value={pendingIVR}
                variant={pendingIVR > 0 ? 'warn' : undefined}
                sub={pendingIVR > 0 ? 'needs action' : 'all clear'}
              />
            )}
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
              className={`report-filter-btn${viewMode === 'conversion' ? ' active' : ''}`}
              onClick={() => setViewMode('conversion')}
            >
              Conversion
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
              <BarChart title="By model &amp; fuel" items={active.modelFuelBreakdown ?? []} color="purple" />
              <BarChart title="By salesperson" items={active.salespersonPerformance ?? []} color="coral" />
              {source !== 'ivr' && active.purposeBreakdown?.length > 0 && (
                <BarChart title="By purpose (walk-ins)" items={active.purposeBreakdown} color="teal" />
              )}
              {source !== 'walkin' && active.reviewStatusBreakdown?.length > 0 && (
                <BarChart title="IVR review status" items={active.reviewStatusBreakdown} color="green" />
              )}
            </div>
          )}

          {/* ── Conversion reports ── */}
          {viewMode === 'conversion' && (
            <div className="reports-conversion-grid">
              <BusinessOutcomes data={filteredConversionReport} />
              <AgentPerformanceTable data={filteredConversionReport} />
              <BranchConversionTable data={filteredConversionReport} />
              <DailyTrendChart data={filteredConversionReport} />
              <HourlyTrendChart data={filteredConversionReport} />
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