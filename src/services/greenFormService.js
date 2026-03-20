import { supabase } from './supabaseClient';

const GREENFORM_PENDING_LEADS_VIEW = 'greenform_pending_leads';
const EMPLOYEES_TABLE = 'employees';
const LOCATIONS_TABLE = 'locations';
const WALKINS_TABLE = 'showroom_walkins';
const IVR_LEADS_TABLE = 'ivr_leads';

function formatEmployeeName(employee) {
  const firstName = employee?.first_name?.trim() || '';
  const lastName = employee?.last_name?.trim() || '';
  return `${firstName} ${lastName}`.trim() || null;
}

export async function getPendingLeads() {
  const { data: leads, error: leadsError } = await supabase
    .from(GREENFORM_PENDING_LEADS_VIEW)
    .select('id, source_type, customer_name, mobile_number, model_name, fuel_types, salesperson_id, location_id, created_at, opty_id')
    .order('created_at', { ascending: false });

  if (leadsError) throw leadsError;

  const salespersonIds = [...new Set((leads || []).map((lead) => lead.salesperson_id).filter(Boolean))];
  const locationIds = [...new Set((leads || []).map((lead) => lead.location_id).filter(Boolean))];

  const [employeesResult, locationsResult] = await Promise.all([
    salespersonIds.length
      ? supabase
          .from(EMPLOYEES_TABLE)
          .select('id, first_name, last_name')
          .in('id', salespersonIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase
          .from(LOCATIONS_TABLE)
          .select('id, name')
          .in('id', locationIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (employeesResult.error) throw employeesResult.error;
  if (locationsResult.error) throw locationsResult.error;

  const employeeNameById = new Map(
    (employeesResult.data || []).map((employee) => [employee.id, formatEmployeeName(employee)])
  );
  const locationNameById = new Map(
    (locationsResult.data || []).map((location) => [location.id, location.name || null])
  );

  return (leads || []).map((lead) => ({
    id: lead.id,
    source_type: lead.source_type,
    customer_name: lead.customer_name,
    mobile_number: lead.mobile_number,
    model_name: lead.model_name,
    fuel_types: lead.fuel_types,
    salesperson_name: employeeNameById.get(lead.salesperson_id) || null,
    location_name: locationNameById.get(lead.location_id) || null,
    created_at: lead.created_at,
    opty_id: lead.opty_id
  }));
}

export async function submitOptyId(source_type, id, opty_id) {
  const normalizedSourceType = String(source_type || '').trim().toLowerCase();

  if (normalizedSourceType !== 'walkin' && normalizedSourceType !== 'ivr' && normalizedSourceType !== 'ai') {
    throw new Error('Invalid source_type. Expected walkin, ivr or ai.');
  }

  // Route to appropriate table:
  // - walkin: showroom_walkins
  // - ivr: ai_leads (promoted interested rows from ivr_leads)
  // - ai: ai_leads (direct AI/chatbot leads)
  const tableName = normalizedSourceType === 'walkin'
    ? WALKINS_TABLE
    : 'ai_leads';

  const { data, error } = await supabase
    .from(tableName)
    .update({
      opty_id,
      opty_status: 'submitted',
      opty_submitted_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTodayGreenFormStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  const [pendingResult, walkinUploadedResult, ivrUploadedResult, aiUploadedResult] = await Promise.all([
    supabase
      .from(GREENFORM_PENDING_LEADS_VIEW)
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from(WALKINS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('opty_status', 'submitted')
      .gte('opty_submitted_at', startIso)
      .lt('opty_submitted_at', endIso),
    supabase
      .from('ai_leads')
      .select('id', { count: 'exact', head: true })
      .eq('lead_source', 'IVR')
      .eq('opty_status', 'submitted')
      .gte('opty_submitted_at', startIso)
      .lt('opty_submitted_at', endIso),
    supabase
      .from('ai_leads')
      .select('id', { count: 'exact', head: true })
      .not('lead_source', 'eq', 'IVR')
      .eq('opty_status', 'submitted')
      .gte('opty_submitted_at', startIso)
      .lt('opty_submitted_at', endIso)
  ]);

  if (pendingResult.error) throw pendingResult.error;
  if (walkinUploadedResult.error) throw walkinUploadedResult.error;
  if (ivrUploadedResult.error) throw ivrUploadedResult.error;
  if (aiUploadedResult.error) throw aiUploadedResult.error;

  const pending_today = pendingResult.count || 0;
  const uploaded_today =
    (walkinUploadedResult.count || 0) +
    (ivrUploadedResult.count || 0) +
    (aiUploadedResult.count || 0);

  return {
    pending_today,
    uploaded_today
  };
}
