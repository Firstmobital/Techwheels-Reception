import { supabase } from './supabaseClient';

const IVR_LEADS_TABLE = 'ivr_leads';

/**
 * Saves an IVR lead into ivr_leads for transcription and review.
 * Leads start with review_status = 'pending' and are processed
 * through transcription before promotion to ai_leads when interested.
 * 
 * @param {Object} params - Lead data
 * @param {boolean} params.autoInvoke - If true, immediately invoke transcription for leads with recording URLs
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
  autoInvoke = false,  // if true, invoke transcription immediately after DB insert
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

  // Auto-invoke transcription if requested and recording URL exists
  if (autoInvoke && data?.id && call_recording_url) {
    supabase.functions.invoke('transcribe-ivr-call', { body: { leadId: data.id } }).catch(() => {});
  }

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

/**
 * Fetches the latest batch of uploaded IVR entries from the last N minutes.
 * Used to restore uploaded entries after user navigates away and returns to the entry tab.
 * 
 * @param {number} minutesWindow - Look back this many minutes (default: 60)
 * @returns {Promise<Array>} Array of recent leads with full details
 */
export async function getLatestUploadedBatch(minutesWindow = 60) {
  const cutoffTime = new Date(Date.now() - minutesWindow * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .select('id, mobile_number, call_datetime, call_recording_url, customer_name, model_name, fuel_type, remarks, conversation_summary, transcript, transcription_status, transcription_error, salesperson_id, location_id, review_status, created_at')
    .gte('created_at', cutoffTime)
    .eq('review_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Creates multiple draft IVR leads in a single batch and invokes transcription for each.
 * Used when user clicks "Preview & Start Transcription" button.
 * 
 * @param {Array} leads - Array of draft lead objects:
 *   { mobile, callDate, callRecordingUrl, locationId, salespersonId }
 * @returns {Promise<Array>} Array of created lead records with { id, mobile }
 */
export async function createBatchDraftLeads(leads) {
  if (!leads || leads.length === 0) return [];

  // Prepare batch insert data
  const insertData = leads.map(lead => ({
    mobile_number: lead.mobile,
    call_datetime: lead.callDate ? new Date(lead.callDate).toISOString() : null,
    call_recording_url: lead.callRecordingUrl || null,
    salesperson_id: lead.salespersonId || null,
    location_id: lead.locationId || null,
    customer_name: null,
    model_name: null,
    fuel_type: null,
    remarks: null,
    transcript: null,
    conversation_summary: null,
    transcription_status: lead.callRecordingUrl ? 'pending' : null,
    review_status: 'pending',
    opty_status: 'pending',
  }));

  // Batch insert all leads
  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .insert(insertData)
    .select('id, mobile_number, call_recording_url');

  if (error) throw error;

  // Invoke transcription asynchronously for each lead with a recording URL
  const createdLeads = data || [];
  createdLeads.forEach(lead => {
    if (lead.call_recording_url) {
      supabase.functions.invoke('transcribe-ivr-call', { body: { leadId: lead.id } }).catch(() => {});
    }
  });

  return createdLeads;
}

/**
 * Updates an existing draft IVR lead with finalized customer data.
 * This is called when user clicks "Save Lead" after the draft was created.
 * Does NOT re-invoke transcription.
 * 
 * @param {number} leadId - ID of the lead to update
 * @param {Object} data - Updated lead data
 */
export async function updateIVRLead(leadId, data) {
  const updatePayload = {};
  
  if (data.customer_name !== undefined) updatePayload.customer_name = data.customer_name || null;
  if (data.model_name !== undefined) updatePayload.model_name = data.model_name || null;
  if (data.fuel_type !== undefined) updatePayload.fuel_type = data.fuel_type || null;
  if (data.remarks !== undefined) updatePayload.remarks = data.remarks || null;
  if (data.salesperson_id !== undefined) updatePayload.salesperson_id = data.salesperson_id || null;
  if (data.location_id !== undefined) updatePayload.location_id = data.location_id || null;
  
  updatePayload.updated_at = new Date().toISOString();
  if (data.markInterested) {
    updatePayload.review_status = 'interested';
    updatePayload.reviewed_at = new Date().toISOString();
  }

  const { data: updatedLead, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .update(updatePayload)
    .eq('id', leadId)
    .select()
    .single();

  if (error) throw error;
  return updatedLead;
}

export async function getExistingIVRMobileNumbers(mobiles) {
  if (!mobiles || mobiles.length === 0) return new Set();

  const uniqueMobiles = [...new Set(mobiles.filter(Boolean))];
  const existing = new Set();
  const chunkSize = 500;

  for (let i = 0; i < uniqueMobiles.length; i += chunkSize) {
    const chunk = uniqueMobiles.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(IVR_LEADS_TABLE)
      .select('mobile_number')
      .in('mobile_number', chunk);

    if (error) throw error;
    (data || []).forEach((row) => {
      if (row?.mobile_number) existing.add(row.mobile_number);
    });
  }

  return existing;
}

export async function importMissedIVRLeads({ locationId, leads }) {
  if (!locationId) throw new Error('Please select a branch before uploading.');
  if (!leads || leads.length === 0) {
    return { insertedCount: 0, insertedRows: [] };
  }

  const normalizedLocationId = Number(locationId);
  if (!Number.isFinite(normalizedLocationId)) {
    throw new Error('Invalid branch selected.');
  }

  const insertPayload = leads.map((lead) => ({
    mobile_number: lead.mobile,
    call_datetime: lead.callDate ? new Date(lead.callDate).toISOString() : null,
    location_id: normalizedLocationId,
    is_missed: true,
    review_status: 'pending',
    opty_status: 'pending',
  }));

  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .insert(insertPayload)
    .select('id, mobile_number, location_id, created_at, is_missed');

  if (error) throw error;
  const insertedRows = data || [];
  return { insertedCount: insertedRows.length, insertedRows };
}

export async function getMissedUploadLastByLocation() {
  const { data, error } = await supabase
    .from(IVR_LEADS_TABLE)
    .select('location_id, created_at')
    .eq('is_missed', true)
    .not('location_id', 'is', null);

  if (error) throw error;

  const lastByLocation = new Map();
  (data || []).forEach((row) => {
    const locationId = row?.location_id;
    const createdAt = row?.created_at;
    if (!locationId || !createdAt) return;

    const previous = lastByLocation.get(String(locationId));
    if (!previous || new Date(createdAt).getTime() > new Date(previous).getTime()) {
      lastByLocation.set(String(locationId), createdAt);
    }
  });

  return lastByLocation;
}