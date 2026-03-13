import { supabase } from './supabaseClient';

const CARS_TABLE = 'car';
const EMPLOYEES_TABLE = 'employees';
const WALKINS_TABLE = 'showroom_walkins';

function formatEmployeeName(employee) {
  const firstName = employee?.first_name?.trim() || '';
  const lastName = employee?.last_name?.trim() || '';
  return `${firstName} ${lastName}`.trim() || null;
}

function formatTokenNumber(tokenValue) {
  return `T${String(tokenValue).padStart(3, '0')}`;
}

function parseTokenNumber(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') return 0;
  const match = tokenString.match(/^T(\d+)$/i);
  if (!match) return 0;
  return Number(match[1]) || 0;
}

async function getNextTokenNumberForToday() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const { data, error } = await supabase
    .from(WALKINS_TABLE)
    .select('token_number')
    .gte('created_at', startOfDay.toISOString())
    .lt('created_at', endOfDay.toISOString())
    .not('token_number', 'is', null);

  if (error) throw error;

  const maxToken = (data || []).reduce((maxValue, row) => {
    const current = parseTokenNumber(row.token_number);
    return current > maxValue ? current : maxValue;
  }, 0);

  return formatTokenNumber(maxToken + 1);
}

export async function getAvailableCars() {
  const { data, error } = await supabase
    .from(CARS_TABLE)
    .select('*')
    .eq('is_published', true)
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getSalesPersons() {
  const { data, error } = await supabase
    .from(EMPLOYEES_TABLE)
    .select('id, first_name, last_name')
    .eq('role_id', 10)
    .order('first_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createWalkIn({
  customer_name,
  mobile_number,
  purpose,
  car_id,
  fuel_type,
  fuel_types,
  salesperson_id
}) {
  const token_number = await getNextTokenNumberForToday();
  const created_at = new Date().toISOString();
  const normalizedFuelType = fuel_type ?? fuel_types ?? null;

  const payload = {
    customer_name,
    mobile_number,
    purpose,
    car_id,
    salesperson_id,
    token_number,
    created_at,
    status: 'assigned'
  };

  let data = null;
  let error = null;

  ({ data, error } = await supabase
    .from(WALKINS_TABLE)
    .insert({ ...payload, fuel_type: normalizedFuelType })
    .select()
    .single());

  if (error && String(error.message || '').toLowerCase().includes('fuel_type')) {
    ({ data, error } = await supabase
      .from(WALKINS_TABLE)
      .insert({ ...payload, fuel_types: normalizedFuelType })
      .select()
      .single());
  }

  if (error) throw error;
  return data;
}

export async function getWaitingWalkins() {
  const { data, error } = await supabase
    .from(WALKINS_TABLE)
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function assignSalesPerson(walkinId, salespersonId) {
  const tokenNumber = await getNextTokenNumberForToday();

  const { data, error } = await supabase
    .from(WALKINS_TABLE)
    .update({
      salesperson_id: salespersonId,
      token_number: tokenNumber,
      status: 'assigned'
    })
    .eq('id', walkinId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWalkInById(walkinId) {
  const { data, error } = await supabase
    .from(WALKINS_TABLE)
    .select('*')
    .eq('id', walkinId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function detectReturningCustomer(mobile) {
  const normalizedMobile = mobile?.trim();
  if (!normalizedMobile) return null;

  const { count, error: countError } = await supabase
    .from(WALKINS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('mobile_number', normalizedMobile);

  if (countError) throw countError;
  if (!count) return null;

  const { data, error } = await supabase
    .from(WALKINS_TABLE)
    .select('*')
    .eq('mobile_number', normalizedMobile)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let lastModel = null;
  let lastSalesperson = null;
  const previousFuelType = data.fuel_type ?? data.fuel_types ?? null;

  if (data.car_id) {
    const { data: carData, error: carError } = await supabase
      .from(CARS_TABLE)
      .select('name')
      .eq('id', data.car_id)
      .maybeSingle();
    if (carError) throw carError;
    lastModel = carData?.name || carData?.model_name || null;
  }

  if (data.salesperson_id) {
    const { data: employeeData, error: employeeError } = await supabase
      .from(EMPLOYEES_TABLE)
      .select('first_name, last_name')
      .eq('id', data.salesperson_id)
      .maybeSingle();
    if (employeeError) throw employeeError;
    lastSalesperson = formatEmployeeName(employeeData);
  }

  return {
    mobile_number: normalizedMobile,
    customer_name: data.customer_name || null,
    last_visit_date: data.created_at || null,
    last_model: lastModel,
    last_salesperson: lastSalesperson,
    last_purpose: data.purpose || null,
    visit_count: count,
    purpose: data.purpose || null,
    car_id: data.car_id || null,
    fuel_type: previousFuelType,
    salesperson_id: data.salesperson_id || null
  };
}
