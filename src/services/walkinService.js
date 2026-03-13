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
  fuel_types,
  salesperson_id
}) {
  const token_number = await getNextTokenNumberForToday();

  const payload = {
    customer_name,
    mobile_number,
    purpose,
    car_id,
    fuel_types,
    salesperson_id,
    token_number,
    status: 'assigned'
  };

  const { data, error } = await supabase
    .from(WALKINS_TABLE)
    .insert(payload)
    .select()
    .single();

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
  const { data, error } = await supabase
    .from(WALKINS_TABLE)
    .select('id, customer_name, mobile_number, car_id, salesperson_id, created_at')
    .eq('mobile_number', mobile)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let lastModel = null;
  let lastSalesperson = null;

  if (data.car_id) {
    const { data: carData, error: carError } = await supabase
      .from(CARS_TABLE)
      .select('name, model_name')
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
    ...data,
    last_model: lastModel,
    last_salesperson: lastSalesperson
  };
}
