// supabase/functions/text-to-speech/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// --- **修正點 1：從 Deno 標準函式庫導入 Buffer** ---
import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts";
import OpenAI from 'npm:openai@4'

// --- **修正點 2：讓 Buffer 成為全域變數，供 OpenAI 函式庫使用** ---
(globalThis as any).Buffer = Buffer;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text } = await req.json()
    if (!text) {
      throw new Error('No text provided for speech synthesis.')
    }

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const audioBuffer = await mp3.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
      },
    });

  } catch (error) {
    console.error(`Error in TTS function: ${error.message}`) // 增加錯誤訊息的前綴
    return new Response(JSON.stringify({ error: `TTS Function Error: ${error.message}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // 改為 500，代表伺服器內部錯誤
    })
  }
})