import { supabase } from './supabaseClient';

const AI_LEADS_TABLE = 'ai_leads';

/**
 * Saves an IVR lead into ai_leads (lead_source = 'IVR').
 * The lead appears in the Leads App AI tab for nurturing.
 * Once "Open Green Form" is clicked there, it surfaces in the
 * Reception App Green Form Queue as source_type = 'ivr'.
 */
export async function createIVRLead({
  customer_name,
  mobile_number,
  model_name,
  fuel_type,       // one of: PETROL | DIESEL | EV | CNG | null
  salesperson_id,
  location_id,
  remarks,
  transcript,      // full Whisper transcript text | null
  call_datetime,   // ISO string or null — date/time of the original IVR call
}) {
  const { data, error } = await supabase
    .from(AI_LEADS_TABLE)
    .insert({
      customer_name,
      mobile_number,
      model_name,
      fuel_type: fuel_type || null,
      salesperson_id: salesperson_id || null,
      location_id: location_id || null,
      remarks,
      transcript: transcript || null,
      call_datetime: call_datetime || null,
      lead_source: 'IVR',
      lead_disposition: 'active',
      opty_status: 'pending',
      greenform_requested: false,
      assigned_at: salesperson_id ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getIVRLeads() {
  const { data, error } = await supabase
    .from(AI_LEADS_TABLE)
    .select('*')
    .eq('lead_source', 'IVR')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}