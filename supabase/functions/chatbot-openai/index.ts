import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
}

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 向量搜尋部分不變
    const embeddingResponse = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query })
    const queryEmbedding = embeddingResponse.data[0].embedding
    const { data: documents } = await supabaseClient.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.2,
      match_count: 5,
    })
    const contextText = documents?.map((doc: any) => doc.content).join('\n---\n') ?? 'No context found.'

    const finalPrompt = `
      You are a helpful assistant. Based on the context below, answer the user's question.
      If the context is not relevant, answer the question directly.

      Context: """
      ${contextText}
      """

      User Question: """
      ${query}
      """
    `
    // 呼叫 OpenAI API 並啟用串流
    const responseStream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: finalPrompt }],
      stream: true,
    })

    // --- **核心修改點：手動建立並處理串流** ---
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const part of responseStream) {
          const textChunk = part.choices[0]?.delta?.content || ''
          controller.enqueue(encoder.encode(textChunk))
        }
        controller.close()
      },
    })

    // 回傳標準的 Response 物件，其 body 是一個 ReadableStream
    return new Response(readableStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8', // 使用 text/plain 更穩定
      },
    })

  } catch (error) {
    console.error('Error in function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // 改為 500，代表伺服器內部錯誤
    })
  }
})