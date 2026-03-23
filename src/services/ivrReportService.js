import { supabase } from './supabaseClient';

const IVR_LEADS_TABLE = 'ivr_leads';
const EMPLOYEES_TABLE = 'employees';
const LOCATIONS_TABLE = 'locations';

function getReportDateRange(filterType = 'today', customStartDate = '', customEndDate = '') {
  const now = new Date();

  if (filterType === 'thisWeek') {
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return {
      start,
      end,
      label: `Week of ${start.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`
    };
  }

  if (filterType === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    };
  }

  if (filterType === 'custom') {
    if (!customStartDate) throw new Error('Please select a start date.');
    const start = new Date(`${customStartDate}T00:00:00`);
    if (isNaN(start.getTime())) throw new Error('Invalid start date.');
    const endBase = customEndDate || customStartDate;
    const end = new Date(`${endBase}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return {
      start,
      end,
      label: customEndDate && customEndDate !== customStartDate
        ? `${start.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} – ${new Date(`${customEndDate}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}`
        : start.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    };
  }

  // today (default)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end, label: 'Today' };
}

function normalizeCountEntries(countMap) {
  return [...countMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Fetch raw IVR leads for a date range, with location + salesperson joined.
 */
export async function getIVRLeadsByRange({ startIso, endIso }) {
  const { data: rows, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .select(
      'id, customer_name, mobile_number, model_name, fuel_type, salesperson_id, location_id, ' +
      'remarks, review_status, opty_status, opty_id, call_datetime, created_at'
    )
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  // Join employees + locations in two parallel fetches
  const empIds = [...new Set(rows.map(r => r.salesperson_id).filter(Boolean))];
  const locIds = [...new Set(rows.map(r => r.location_id).filter(Boolean))];

  const [{ data: emps }, { data: locs }] = await Promise.all([
    empIds.length
      ? supabase.from(EMPLOYEES_TABLE).select('id, first_name, last_name').in('id', empIds)
      : Promise.resolve({ data: [] }),
    locIds.length
      ? supabase.from(LOCATIONS_TABLE).select('id, name').in('id', locIds)
      : Promise.resolve({ data: [] }),
  ]);

  const empById = new Map((emps || []).map(e => [e.id, e]));
  const locById = new Map((locs || []).map(l => [l.id, l]));

  return rows.map(row => {
    const emp = empById.get(row.salesperson_id);
    const loc = locById.get(row.location_id);
    return {
      ...row,
      salesperson: emp
        ? { id: emp.id, first_name: emp.first_name, last_name: emp.last_name }
        : null,
      location: loc ? { id: loc.id, name: loc.name } : null,
    };
  });
}

/**
 * Aggregate IVR leads for the reports view — mirrors getWalkinReports shape.
 */
export async function getIVRReports({
  filterType = 'today',
  customStartDate = '',
  customEndDate = '',
} = {}) {
  const { start, end, label } = getReportDateRange(filterType, customStartDate, customEndDate);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const leads = await getIVRLeadsByRange({ startIso, endIso });

  const modelCounts = new Map();
  const fuelCounts = new Map();
  const salespersonCounts = new Map();
  const branchCounts = new Map();
  const reviewStatusCounts = new Map();

  leads.forEach(lead => {
    const model = (lead.model_name || '').trim() || 'Unknown';
    modelCounts.set(model, (modelCounts.get(model) || 0) + 1);

    const fuel = (lead.fuel_type || '').trim() || 'Unknown';
    fuelCounts.set(fuel, (fuelCounts.get(fuel) || 0) + 1);

    const sp =
      lead.salesperson
        ? `${lead.salesperson.first_name || ''} ${lead.salesperson.last_name || ''}`.trim() || 'Unassigned'
        : 'Unassigned';
    salespersonCounts.set(sp, (salespersonCounts.get(sp) || 0) + 1);

    const branch = (lead.location?.name || '').trim() || 'Unknown';
    branchCounts.set(branch, (branchCounts.get(branch) || 0) + 1);

    const rs = (lead.review_status || 'pending').trim();
    reviewStatusCounts.set(rs, (reviewStatusCounts.get(rs) || 0) + 1);
  });

  return {
    filterType,
    dateRange: { startIso, endIso, label },
    totalLeads: leads.length,
    modelInterest: normalizeCountEntries(modelCounts),
    fuelPreference: normalizeCountEntries(fuelCounts),
    salespersonPerformance: normalizeCountEntries(salespersonCounts),
    branchLeads: normalizeCountEntries(branchCounts),
    reviewStatusBreakdown: normalizeCountEntries(reviewStatusCounts),
    rows: leads,
  };
}
