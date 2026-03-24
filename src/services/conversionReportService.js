import { supabase } from './supabaseClient';

const BOOKINGS_TABLE      = 'booking';
const WALKINS_TABLE       = 'showroom_walkins';
const IVR_TABLE           = 'ivr_leads';
const EMPLOYEES_TABLE     = 'employees';
const LOCATIONS_TABLE     = 'locations';

// ─── date range helpers (mirrors ivrReportService) ───────────────────────────

function getDateRange(filterType = 'today', customStartDate = '', customEndDate = '') {
  const now = new Date();

  if (filterType === 'thisWeek') {
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
    const end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { start, end };
  }

  if (filterType === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }

  if (filterType === 'custom') {
    if (!customStartDate) throw new Error('Please select a start date.');
    const start = new Date(`${customStartDate}T00:00:00`);
    if (isNaN(start.getTime())) throw new Error('Invalid start date.');
    const endBase = customEndDate || customStartDate;
    const end = new Date(`${endBase}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  // today
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

// ─── main fetch ──────────────────────────────────────────────────────────────

/**
 * Fetches all leads (walkin + IVR) in a date range, then checks which ones
 * have a matching booking via crm_opty_id = opty_id.
 *
 * Returns per-lead rows with a `converted` boolean, plus pre-aggregated
 * breakdowns for agent, branch, daily trend and hourly trend.
 */
export async function getConversionReport({
  filterType = 'today',
  customStartDate = '',
  customEndDate = '',
} = {}) {
  const { start, end } = getDateRange(filterType, customStartDate, customEndDate);
  const startIso = start.toISOString();
  const endIso   = end.toISOString();

  // ── 1. Fetch walkin rows in range ────────────────────────────────────────
  const { data: walkinRows, error: wErr } = await supabase
    .from(WALKINS_TABLE)
    .select('id, customer_name, mobile_number, opty_id, salesperson_id, location_id, created_at, car_id, fuel_types')
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (wErr) throw wErr;

  // ── 2. Fetch IVR rows in range ───────────────────────────────────────────
  const { data: ivrRows, error: iErr } = await supabase
    .from(IVR_TABLE)
    .select('id, customer_name, mobile_number, opty_id, salesperson_id, location_id, created_at, model_name, fuel_type')
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (iErr) throw iErr;

  // ── 3. Collect all opty_ids that are non-null ────────────────────────────
  const walkins = walkinRows || [];
  const ivrs    = ivrRows    || [];

  const allOptyIds = [
    ...walkins.map(r => r.opty_id),
    ...ivrs.map(r => r.opty_id),
  ].filter(Boolean);

  // ── 4. Fetch matching bookings by crm_opty_id ────────────────────────────
  let convertedOptyIds = new Set();
  if (allOptyIds.length > 0) {
    const { data: bookings, error: bErr } = await supabase
      .from(BOOKINGS_TABLE)
      .select('crm_opty_id')
      .in('crm_opty_id', allOptyIds);
    if (bErr) throw bErr;
    (bookings || []).forEach(b => {
      if (b.crm_opty_id) convertedOptyIds.add(b.crm_opty_id);
    });
  }

  // ── 5. Resolve employee + location names ────────────────────────────────
  const empIds = [...new Set([
    ...walkins.map(r => r.salesperson_id),
    ...ivrs.map(r => r.salesperson_id),
  ].filter(Boolean))];

  const locIds = [...new Set([
    ...walkins.map(r => r.location_id),
    ...ivrs.map(r => r.location_id),
  ].filter(Boolean))];

  const [{ data: emps }, { data: locs }] = await Promise.all([
    empIds.length
      ? supabase.from(EMPLOYEES_TABLE).select('id, first_name, last_name').in('id', empIds)
      : Promise.resolve({ data: [] }),
    locIds.length
      ? supabase.from(LOCATIONS_TABLE).select('id, name').in('id', locIds)
      : Promise.resolve({ data: [] }),
  ]);

  const empById = new Map((emps || []).map(e => [String(e.id), e]));
  const locById = new Map((locs || []).map(l => [String(l.id), l]));

  function getEmpName(id) {
    if (!id) return 'Unassigned';
    const e = empById.get(String(id));
    if (!e) return 'Unassigned';
    return `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unassigned';
  }

  function getLocName(id) {
    if (!id) return 'Unknown';
    return locById.get(String(id))?.name || 'Unknown';
  }

  // ── 6. Tag each row with conversion status ───────────────────────────────
  const taggedWalkins = walkins.map(r => ({
    ...r,
    _source: 'walkin',
    _converted: Boolean(r.opty_id && convertedOptyIds.has(r.opty_id)),
    _agentName:  getEmpName(r.salesperson_id),
    _branchName: getLocName(r.location_id),
  }));

  const taggedIvrs = ivrs.map(r => ({
    ...r,
    _source: 'ivr',
    _converted: Boolean(r.opty_id && convertedOptyIds.has(r.opty_id)),
    _agentName:  getEmpName(r.salesperson_id),
    _branchName: getLocName(r.location_id),
  }));

  const allRows = [...taggedWalkins, ...taggedIvrs];

  // ── 7. Aggregate: agent performance ─────────────────────────────────────
  const agentMap = new Map(); // agentName → { leads, converted }
  allRows.forEach(r => {
    const key = r._agentName;
    if (!agentMap.has(key)) agentMap.set(key, { leads: 0, converted: 0 });
    const entry = agentMap.get(key);
    entry.leads++;
    if (r._converted) entry.converted++;
  });

  const agentPerformance = [...agentMap.entries()]
    .map(([agent, { leads, converted }]) => ({
      agent,
      leads,
      converted,
      rate: leads > 0 ? Math.round((converted / leads) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.leads - a.leads);

  // ── 8. Aggregate: branch conversion ─────────────────────────────────────
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
      return {
        branch,
        total,
        walkins: w,
        ivr,
        converted,
        rate: total > 0 ? Math.round((converted / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // ── 9. Aggregate: source breakdown ──────────────────────────────────────
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

  // ── 10. Daily trend ──────────────────────────────────────────────────────
  const dailyMap = new Map(); // 'YYYY-MM-DD' → { total, converted }
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

  // ── 11. Hourly trend ─────────────────────────────────────────────────────
  const hourlyMap = new Map(); // hour (0-23) → { walkin, ivr }
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

  // ── 12. Business outcomes ────────────────────────────────────────────────
  const totalLeads     = allRows.length;
  const totalConverted = allRows.filter(r => r._converted).length;
  const totalLost      = allRows.filter(r => r.opty_id && !r._converted).length;
  const convRate       = totalLeads > 0 ? ((totalConverted / totalLeads) * 100).toFixed(1) : '0.0';

  return {
    totalLeads,
    totalConverted,
    totalLost,
    convRate,
    sourceBreakdown,
    agentPerformance,
    branchConversion,
    dailyTrend,
    hourlyTrend,
    dateRange: { startIso, endIso },
  };
}