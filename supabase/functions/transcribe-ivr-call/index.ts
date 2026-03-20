import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('PROJECT_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const AI_LEADS_TABLE = 'ai_leads';
const CAR_TABLE = 'car';
const FUEL_TYPE_TABLE = 'fuel_type';
const EMPLOYEES_TABLE = 'employees';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type LeadRow = {
  id: string | number;
  customer_name: string | null;
  model_name: string | null;
  fuel_type: string | null;
  salesperson_id: string | number | null;
  remarks: string | null;
  conversation_summary: string | null;
  transcript: string | null;
  call_recording_url: string | null;
  transcription_status: string | null;
};

type ExtractedPayload = {
  customer_name: string | null;
  model_name_raw: string | null;
  fuel_type_raw: string | null;
  ca_name_raw: string | null;
  summary: string | null;
  operator_note: string | null;
  transcript_quality: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickIfBlank(existing: unknown, nextValue: unknown) {
  const hasExisting = existing !== null && existing !== undefined && String(existing).trim() !== '';
  if (hasExisting) return undefined;
  if (nextValue === null || nextValue === undefined) return undefined;
  if (String(nextValue).trim() === '') return undefined;
  return nextValue;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function normalizeModelName(extractedModel: string | null, carsFromDb: string[]): string | null {
  const target = normalizeText(extractedModel);
  if (!target) return null;

  let bestExactOrContain: string | null = null;
  let bestFuzzy: { model: string; score: number } | null = null;

  for (const model of carsFromDb) {
    const normalizedModel = normalizeText(model);
    if (!normalizedModel) continue;

    if (normalizedModel === target) return model;
    if (normalizedModel.includes(target) || target.includes(normalizedModel)) {
      bestExactOrContain = bestExactOrContain || model;
    }

    const score = similarityScore(target, normalizedModel);
    if (!bestFuzzy || score > bestFuzzy.score) {
      bestFuzzy = { model, score };
    }
  }

  if (bestExactOrContain) return bestExactOrContain;
  if (bestFuzzy && bestFuzzy.score >= 0.72) return bestFuzzy.model;
  return null;
}

function normalizeFuelType(extractedFuel: string | null, allowedFuelCodes: string[]): string | null {
  const value = normalizeText(extractedFuel);
  if (!value) return null;

  const canonical = new Set(['PETROL', 'DIESEL', 'EV', 'CNG']);
  const allowed = new Set((allowedFuelCodes || []).map((c) => String(c || '').toUpperCase()).filter((c) => canonical.has(c)));
  const accepted = allowed.size ? allowed : canonical;

  const candidates: Array<{ key: string; out: 'PETROL' | 'DIESEL' | 'EV' | 'CNG' }> = [
    { key: 'diesel', out: 'DIESEL' },
    { key: 'petrol', out: 'PETROL' },
    { key: 'gasoline', out: 'PETROL' },
    { key: 'electric', out: 'EV' },
    { key: 'ev', out: 'EV' },
    { key: 'cng', out: 'CNG' },
  ];

  for (const c of candidates) {
    if (value.includes(c.key) && accepted.has(c.out)) {
      return c.out;
    }
  }

  const upper = String(extractedFuel || '').trim().toUpperCase();
  if (accepted.has(upper)) return upper;

  return null;
}

function matchEmployeeFromExtractedCAName(
  extractedCAName: string | null,
  employeesFromDb: Array<{ id: string | number; first_name: string | null; last_name: string | null }>
): { id: string | number; score: number; isStrong: boolean } | null {
  const target = normalizeText(extractedCAName);
  if (!target) return null;

  let best: { id: string | number; score: number } | null = null;

  for (const emp of employeesFromDb) {
    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const normName = normalizeText(fullName);
    if (!normName) continue;

    let score = 0;
    if (normName === target) {
      score = 100;
    } else if (normName.includes(target) || target.includes(normName)) {
      score = 88;
    } else {
      const scoreBySimilarity = similarityScore(target, normName) * 100;
      const targetParts = target.split(' ').filter(Boolean);
      const empParts = normName.split(' ').filter(Boolean);
      const overlap = targetParts.filter((p) => empParts.includes(p)).length;
      const overlapBoost = overlap * 8;
      score = Math.max(scoreBySimilarity, overlapBoost);
    }

    if (!best || score > best.score) best = { id: emp.id, score };
  }

  if (!best) return null;
  return {
    id: best.id,
    score: best.score,
    isStrong: best.score >= 85,
  };
}

async function transcribeAudio(recordingUrl: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const audioRes = await fetch(recordingUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch recording (${audioRes.status})`);
  }

  const audioBuffer = await audioRes.arrayBuffer();
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'recording.mp3');
  formData.append('model', 'whisper-1');
  formData.append('language', 'hi');
  formData.append('response_format', 'text');

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!whisperRes.ok) {
    throw new Error(`Whisper error (${whisperRes.status}): ${await whisperRes.text()}`);
  }

  return (await whisperRes.text()).trim();
}

async function extractFromTranscript(transcript: string, availableModels: string[]): Promise<ExtractedPayload> {
  if (!ANTHROPIC_API_KEY) {
    return {
      customer_name: null,
      model_name_raw: null,
      fuel_type_raw: null,
      ca_name_raw: null,
      summary: null,
      operator_note: null,
      transcript_quality: null,
    };
  }

  const modelLine = availableModels.length
    ? availableModels.join(', ')
    : 'Nexon, Punch, Tiago, Harrier, Safari, Altroz, Curvv';

  const prompt = `You are extracting structured dealership lead details from an IVR call transcript.

Transcript language can be Hindi, English, or Hinglish.
Available car models (reference only, do not force-match): ${modelLine}

Return ONLY valid JSON with exactly these keys:
{
  "customer_name": string | null,
  "model_name_raw": string | null,
  "fuel_type_raw": string | null,
  "ca_name_raw": string | null,
  "summary": string | null,
  "operator_note": string | null,
  "transcript_quality": string | null
}

Rules:
- JSON only, no markdown, no explanation.
- Do not invent values. If unknown, return null.
- customer_name only if clearly spoken by the caller.
- model_name_raw must preserve what was heard (no normalization).
- fuel_type_raw must preserve what was heard (no normalization).
- ca_name_raw must preserve what was heard (no normalization).
- summary should be short and operationally useful (1-2 sentences).
- operator_note should be concise and suitable for CRM notes (ai_leads.remarks).
- transcript_quality must be one of: "good", "partial", "poor"; otherwise null.

Transcript:
${transcript}`;

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    throw new Error(`Claude error (${claudeRes.status}): ${await claudeRes.text()}`);
  }

  const claudeData = await claudeRes.json();
  const raw = claudeData.content?.map((b: { text?: string }) => b.text || '').join('') || '';

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return {
      customer_name: parsed.customer_name || null,
      ca_name_raw: parsed.ca_name_raw || null,
      model_name_raw: parsed.model_name_raw || null,
      fuel_type_raw: parsed.fuel_type_raw || null,
      summary: parsed.summary || null,
      operator_note: parsed.operator_note || null,
      transcript_quality: ['good', 'partial', 'poor'].includes(String(parsed.transcript_quality || '').toLowerCase())
        ? String(parsed.transcript_quality).toLowerCase()
        : null,
    };
  } catch {
    return {
      customer_name: null,
      ca_name_raw: null,
      model_name_raw: null,
      fuel_type_raw: null,
      summary: raw.slice(0, 300) || null,
      operator_note: null,
      transcript_quality: null,
    };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase admin credentials not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let leadId: string | number | null = null;

  try {
    const body = await req.json();
    leadId = body?.leadId ?? null;

    if (leadId === null || leadId === undefined || String(leadId).trim() === '') {
      return new Response(JSON.stringify({ error: 'leadId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: lead, error: leadError } = await supabase
      .from(AI_LEADS_TABLE)
      .select('id, customer_name, model_name, fuel_type, salesperson_id, remarks, conversation_summary, transcript, call_recording_url, transcription_status')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      throw new Error(leadError?.message || 'Lead not found');
    }

    if (!lead.call_recording_url) {
      throw new Error('call_recording_url is missing');
    }

    const { error: statusError } = await supabase
      .from(AI_LEADS_TABLE)
      .update({
        transcription_status: 'processing',
        transcription_error: null,
      })
      .eq('id', lead.id);

    if (statusError) {
      throw statusError;
    }

    const { data: cars, error: carsError } = await supabase
      .from(CAR_TABLE)
      .select('name, model_name')
      .eq('is_published', true);

    if (carsError) {
      throw carsError;
    }

    const { data: fuelTypes, error: fuelTypesError } = await supabase
      .from(FUEL_TYPE_TABLE)
      .select('code');

    if (fuelTypesError) {
      throw fuelTypesError;
    }

    const carNames = (cars || [])
      .flatMap((row: { name?: string | null; model_name?: string | null }) => [row.name, row.model_name])
      .map((name: string | null | undefined) => String(name || '').trim())
      .filter(Boolean);

    const fuelCodes = (fuelTypes || [])
      .map((row: { code?: string | null }) => String(row.code || '').trim().toUpperCase())
      .filter(Boolean);

    const transcript = await transcribeAudio(lead.call_recording_url);
    const extracted = await extractFromTranscript(transcript, carNames);

    const normalizedModel = normalizeModelName(extracted.model_name_raw, carNames);
    const normalizedFuel = normalizeFuelType(extracted.fuel_type_raw, fuelCodes);

    let matchedSalespersonId: string | number | null = null;
    if (!lead.salesperson_id && extracted.ca_name_raw) {
      const { data: employees, error: employeesError } = await supabase
        .from(EMPLOYEES_TABLE)
        .select('id, first_name, last_name')
        .eq('role_id', 10)
        .limit(500);

      if (employeesError) {
        throw employeesError;
      }

      const matched = matchEmployeeFromExtractedCAName(extracted.ca_name_raw, employees || []);
      if (matched?.isStrong) {
        matchedSalespersonId = matched.id;
      }
    }

    const updatePayload: Record<string, unknown> = {
      transcription_status: 'completed',
      transcription_error: null,
      transcribed_at: new Date().toISOString(),
      ca_name_raw: extracted.ca_name_raw || null,
      model_name_raw: extracted.model_name_raw || null,
      fuel_type_raw: extracted.fuel_type_raw || null,
    };

    const transcriptForWrite = pickIfBlank(lead.transcript, transcript);
    if (transcriptForWrite !== undefined) updatePayload.transcript = transcriptForWrite;

    const customerNameForWrite = pickIfBlank(lead.customer_name, extracted.customer_name);
    if (customerNameForWrite !== undefined) updatePayload.customer_name = customerNameForWrite;

    const summaryForWrite = pickIfBlank(lead.conversation_summary, extracted.summary);
    if (summaryForWrite !== undefined) updatePayload.conversation_summary = summaryForWrite;

    const modelForWrite = pickIfBlank(lead.model_name, normalizedModel);
    if (modelForWrite !== undefined) updatePayload.model_name = modelForWrite;

    const fuelForWrite = pickIfBlank(lead.fuel_type, normalizedFuel);
    if (fuelForWrite !== undefined) updatePayload.fuel_type = fuelForWrite;

    const salespersonForWrite = pickIfBlank(lead.salesperson_id, matchedSalespersonId);
    if (salespersonForWrite !== undefined) updatePayload.salesperson_id = salespersonForWrite;

    // Keep operator note safe; only fill remarks when empty.
    const remarksForWrite = pickIfBlank(lead.remarks, extracted.operator_note || extracted.summary);
    if (remarksForWrite !== undefined) updatePayload.remarks = remarksForWrite;

    const { data: updatedLead, error: updateError } = await supabase
      .from(AI_LEADS_TABLE)
      .update(updatePayload)
      .eq('id', lead.id)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, lead: updatedLead }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (leadId !== null && leadId !== undefined && String(leadId).trim() !== '' && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });

        await supabase
          .from(AI_LEADS_TABLE)
          .update({
            transcription_status: 'failed',
            transcription_error: message,
          })
          .eq('id', leadId);
      } catch (_statusUpdateError) {
        // Keep original transcription error response even if failed-status update cannot be persisted.
      }
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
