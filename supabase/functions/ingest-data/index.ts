// supabase/functions/ingest-data/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'

// --- TypeScript 型別定義 (與前端保持一致) ---
interface FlavorProfile {
  index: string;
  remark: string;
}
interface Ingredient {
  name: string;
  story: string;
  flavor_profiles: FlavorProfile[];
}
interface MainFlavor {
  name: string;
  flavor_profiles: FlavorProfile[];
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

    // 1. 同時讀取菜品和酒品
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
    
    // 2. 清空舊的知識庫
    await supabaseClient.from('documents').delete().neq('id', -1)

    // 3. 遍歷所有項目，產生新的知識庫內容
    for (const item of allItems) {
      let content = '';
      
      // 判斷是菜品還是酒品，並產生對應的結構化語料
      if ('ingredients' in item && item.ingredients) { // 這是菜品
        const ingredients = item.ingredients as Ingredient[] | null;
        const ingredientsText = ingredients
          ?.map(i => `  - 食材「${i.name}」的故事是：${i.story || '無'}\n    其風味細節如下：\n${i.flavor_profiles?.map(fp => `      - Index ${fp.index}: ${fp.remark}`).join('\n') || '      - 無'}`)
          .join('\n') || '未提供';
        content = `
# 菜品資訊：${item.name}
## 菜品故事
${item.story || '無'}
## 食材細節
${ingredientsText}
## 價格
${item.price} 元
`;
      } else if ('main_flavors' in item && item.main_flavors) { // 這是酒品
        const main_flavors = item.main_flavors as MainFlavor[] | null;
        const flavorsText = main_flavors
          ?.map(mf => `  - 主要風味「${mf.name}」的細節描述如下：\n${mf.flavor_profiles?.map(fp => `    - Index ${fp.index}: ${fp.remark}`).join('\n') || '    - 無'}`)
          .join('\n') || '未提供';
        content = `
# 酒品資訊：${item.name}
## 酒品故事
${item.story || '無'}
## 風味細節
${flavorsText}
## 價格
${item.price} 元
`;
      }

      if (content) {
        const embeddingResponse = await openai.embeddings.create({ model: 'text-embedding-3-small', input: content.trim() });
        const embedding = embeddingResponse.data[0].embedding;
        await supabaseClient.from('documents').insert({ content: content.trim(), embedding });
      }
    }

    return new Response(JSON.stringify({ message: `成功同步 ${allItems.length} 筆項目資料到 AI 知識庫。` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})