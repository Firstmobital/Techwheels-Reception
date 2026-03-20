import { supabase } from './supabaseClient';

const IVR_LEADS_TABLE = 'ivr_leads';

/**
 * Saves an IVR lead into ivr_leads for transcription and review.
 * Leads start with review_status = 'pending' and are processed
 * through transcription before promotion to ai_leads when interested.
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
  conversation_summary, // short extracted summary | null
  call_datetime,   // ISO string or null — date/time of the original IVR call
  call_recording_url, // IVR call recording URL | null
}) {
  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .insert({
      customer_name,
      mobile_number,
      model_name,
      fuel_type: fuel_type || null,
      salesperson_id: salesperson_id || null,
      location_id: location_id || null,
      remarks,
      transcript: transcript || null,
      conversation_summary: conversation_summary || null,
      call_datetime: call_datetime || null,
      call_recording_url: call_recording_url || null,
      transcription_status: call_recording_url ? 'pending' : null,
      review_status: 'pending',
      opty_status: 'pending',
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