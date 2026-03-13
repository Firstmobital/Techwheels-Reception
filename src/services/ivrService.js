import { supabase } from './supabaseClient';

const IVR_LEADS_TABLE = 'ivr_leads';

export async function createIVRLead({
  customer_name,
  mobile_number,
  model_name,
  salesperson_id,
  location_id,
  remarks
}) {
  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .insert({
      customer_name,
      mobile_number,
      model_name,
      salesperson_id,
      location_id,
      remarks,
      opty_status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getIVRLeads() {
  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
