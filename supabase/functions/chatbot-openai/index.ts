// supabase/functions/chatbot-openai/index.ts (Final Optimized Version)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'

interface Document { id: number; content: string; similarity: number; }
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { query, customPrompt } = await req.json()
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })

    const embeddingResponse = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query })
    const queryEmbedding = embeddingResponse.data[0].embedding

    const { data: documents, error: matchError } = await supabaseClient.rpc('match_documents', { query_embedding: queryEmbedding, match_threshold: 0.45, match_count: 5 })
    if (matchError) throw new Error(`RPC function error: ${matchError.message}`)

    const contextText = documents && documents.length > 0 ? documents.map((doc: Document) => doc.content).join('\n---\n') : 'No relevant context found.'

    // --- **優化點：使用更簡單、直接的 Prompt** ---
    const finalPrompt = `
      You are a helpful assistant whose persona is: "${customPrompt}".
      Based on the following context, please answer the user's question.

      Context: """
      ${contextText}
      """

      User Question: """
      ${query}
      """

      If the context is not relevant, just say: "抱歉，我找不到相關資料。"
    `
    
    const chatResponse = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: finalPrompt }], temperature: 0.2 })
    const responseContent = chatResponse.choices[0].message.content

    return new Response(JSON.stringify({ response: responseContent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})