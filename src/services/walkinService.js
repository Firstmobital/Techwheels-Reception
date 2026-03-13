import { supabase } from './supabaseClient';

const CARS_TABLE = 'car';
const EMPLOYEES_TABLE = 'employees';
const LOCATIONS_TABLE = 'locations';
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

function toStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function normalizeCountEntries(countMap) {
  return [...countMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
}

function normalizePurposeLabel(purpose) {
  const value = purpose?.trim();
  return value || 'Unknown';
}

function normalizeFuelValues(walkin) {
  const fuel = walkin.fuel_type || walkin.fuel_types;
  const fuelSource = fuel;
  if (Array.isArray(fuelSource)) {
    return fuelSource.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof fuelSource === 'string') {
    return fuelSource
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function getWalkinModelName(walkin) {
  return walkin?.car?.name?.trim() || 'Unknown';
}

function getWalkinSalespersonName(walkin) {
  const firstName = walkin?.salesperson?.first_name?.trim() || '';
  const lastName = walkin?.salesperson?.last_name?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Unassigned';
}

function getReportDateRange(filterType = 'today', customDate = '') {
  const now = new Date();

  if (filterType === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
      })
    };
  }

  if (filterType === 'custom') {
    if (!customDate) {
      throw new Error('Please select a date for custom report.');
    }

    const selected = new Date(`${customDate}T00:00:00`);
    if (Number.isNaN(selected.getTime())) {
      throw new Error('Invalid custom date selected.');
    }

    const start = toStartOfDay(selected);
    const end = addDays(start, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    };
  }

  const start = toStartOfDay(now);
  const end = addDays(start, 1);
  return {
    start,
    end,
    label: 'Today'
  };
}

async function getCarsByIds(carIds) {
  if (!carIds.length) return [];

  const { data, error } = await supabase
    .from(CARS_TABLE)
    .select('id, name, model_name')
    .in('id', carIds);

  if (error) throw error;
  return data || [];
}

async function getEmployeesByIds(employeeIds) {
  if (!employeeIds.length) return [];

  const { data, error } = await supabase
    .from(EMPLOYEES_TABLE)
    .select('id, first_name, last_name')
    .in('id', employeeIds);

  if (error) throw error;
  return data || [];
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

export async function getLocations() {
  const { data, error } = await supabase
    .from(LOCATIONS_TABLE)
    .select('id,name')
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getSalesPersonsByLocation(locationId) {
  const { data, error } = await supabase
    .from(EMPLOYEES_TABLE)
    .select('id,first_name,last_name,location_id')
    .eq('role_id', 10)
    .eq('location_id', locationId)
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
  salesperson_id,
  location_id
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
    location_id,
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

export async function getWalkinsByCreatedAtRange({ startIso, endIso }) {
  let data = null;
  let error = null;

  ({ data, error } = await supabase
    .from(WALKINS_TABLE)
    .select(`
      id,
      purpose,
      fuel_types,
      fuel_type,
      car_id,
      salesperson_id,
      created_at,
      car:car_id(name),
      salesperson:salesperson_id(first_name,last_name)
    `)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false }));

  if (error && String(error.message || '').toLowerCase().includes('fuel_type')) {
    ({ data, error } = await supabase
      .from(WALKINS_TABLE)
      .select(`
        id,
        purpose,
        fuel_types,
        car_id,
        salesperson_id,
        created_at,
        car:car_id(name),
        salesperson:salesperson_id(first_name,last_name)
      `)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false }));
  }

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    fuel_type: row.fuel_type || row.fuel_types || null
  }));
}

export async function getWalkinReports({ filterType = 'today', customDate = '' } = {}) {
  const { start, end, label } = getReportDateRange(filterType, customDate);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const walkins = await getWalkinsByCreatedAtRange({ startIso, endIso });

  const purposeCounts = new Map();
  const modelCounts = new Map();
  const fuelCounts = new Map();
  const salespersonCounts = new Map();

  walkins.forEach((walkin) => {
    const purposeLabel = normalizePurposeLabel(walkin.purpose);
    purposeCounts.set(purposeLabel, (purposeCounts.get(purposeLabel) || 0) + 1);

    const modelLabel = getWalkinModelName(walkin);
    modelCounts.set(modelLabel, (modelCounts.get(modelLabel) || 0) + 1);

    const fuels = normalizeFuelValues(walkin);
    if (fuels.length === 0) {
      fuelCounts.set('Unknown', (fuelCounts.get('Unknown') || 0) + 1);
    } else {
      fuels.forEach((fuel) => {
        fuelCounts.set(fuel, (fuelCounts.get(fuel) || 0) + 1);
      });
    }

    const salespersonName = getWalkinSalespersonName(walkin);
    salespersonCounts.set(salespersonName, (salespersonCounts.get(salespersonName) || 0) + 1);
  });

  return {
    filterType,
    dateRange: {
      startIso,
      endIso,
      label
    },
    totalWalkins: walkins.length,
    purposeBreakdown: normalizeCountEntries(purposeCounts),
    modelInterest: normalizeCountEntries(modelCounts),
    fuelPreference: normalizeCountEntries(fuelCounts),
    salespersonPerformance: normalizeCountEntries(salespersonCounts)
  };
}
