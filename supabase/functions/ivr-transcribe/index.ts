import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { recordingUrl, carList, hasPhoneMatch } = await req.json();

    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: 'recordingUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const audioRes = await fetch(recordingUrl);
    if (!audioRes.ok) throw new Error(`Failed to fetch recording (${audioRes.status})`);
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

    if (!whisperRes.ok) throw new Error(`Whisper error (${whisperRes.status}): ${await whisperRes.text()}`);
    const transcript = (await whisperRes.text()).trim();

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ transcript, customerName: null, caName: null, modelName: null, fuelType: null, summary: '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cars = carList || 'Nexon, Punch, Tiago, Harrier, Safari, Altroz, Curvv';
    const caLine = hasPhoneMatch
      ? 'Do NOT extract CA name — already matched from phone number.'
      : 'Extract the CA/advisor name if mentioned in the call.';

    const prompt = `You are a data extraction assistant for a Tata Motors dealership in India.
Transcript of an IVR sales call (may be Hindi, English, or Hinglish):

Available car models: ${cars}
Fuel types: PETROL, DIESEL, EV, CNG

Extract:
1. Customer name (look for "mera naam", "I am", "main hoon", direct introduction)
2. ${caLine}
3. Car model — match EXACTLY to one of the available models, or null
4. Fuel type — PETROL, DIESEL, EV, CNG, or null
5. SHORT summary of the call — 2-3 sentences in English

Respond ONLY with valid JSON, no markdown, no extra text:
{"customerName":"string or null","caName":"string or null","modelName":"exact model or null","fuelType":"PETROL/DIESEL/EV/CNG or null","summary":"2-3 sentence summary"}

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

    if (!claudeRes.ok) throw new Error(`Claude error (${claudeRes.status}): ${await claudeRes.text()}`);

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.map((b) => b.text || '').join('') || '';

    let extracted;
    try {
      extracted = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      extracted = { customerName: null, caName: null, modelName: null, fuelType: null, summary: raw.slice(0, 300) };
    }

    return new Response(
      JSON.stringify({ transcript, ...extracted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});