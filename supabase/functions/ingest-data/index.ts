// supabase/functions/ingest-data/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'

interface Ingredient {
  name: string;
  story: string;
}

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 同時讀取菜品和酒品
    const [dishesRes, winesRes] = await Promise.all([
      supabaseClient.from('dishes').select('*'),
      supabaseClient.from('wines').select('*')
    ]);
    if (dishesRes.error) throw dishesRes.error;
    if (winesRes.error) throw winesRes.error;

    const allItems = [...dishesRes.data, ...winesRes.data];
    if (!allItems || allItems.length === 0) {
      return new Response(JSON.stringify({ message: '資料庫中沒有項目可同步。' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }
    
    await supabaseClient.from('documents').delete().neq('id', -1)

    for (const item of allItems) {
      let content = '';
      // 判斷是菜品還是酒品，並產生對應的語料
      if ('ingredients' in item) { // 這是菜品
        const ingredients = item.ingredients as Ingredient[] | null;
        const ingredientsText = ingredients?.map(i => `${i.name} (故事: ${i.story || '無'})`).join('、') || '未提供';
        content = `這是一道名為「${item.name}」的菜品。故事是：「${item.story || '無'}」。使用的食材包含：${ingredientsText}。價格是${item.price}元。`;
      } else { // 這是酒品
        const flavors = item.flavors as string[] | null;
        const flavorsText = flavors?.join(', ') || '未提供';
        content = `這是一支名為「${item.name}」的酒品。故事是：「${item.story || '無'}」。風味包含：${flavorsText}。價格是${item.price}元。`;
      }

      const embeddingResponse = await openai.embeddings.create({ model: 'text-embedding-3-small', input: content });
      const embedding = embeddingResponse.data[0].embedding;
      await supabaseClient.from('documents').insert({ content, embedding });
    }

    return new Response(JSON.stringify({ message: `成功同步 ${allItems.length} 筆項目資料到 AI 知識庫。` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})