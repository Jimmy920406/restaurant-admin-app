// src/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- 通用：呼叫 Edge Function 並「以 Blob 取得回應」 ----
export async function callEdgeFunctionBlob(fnName: string, body: unknown, expectedTypePrefix = 'audio/'): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User is not authenticated.');
  }

  const url = `${supabaseUrl}/functions/v1/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body ?? {}),
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch { /* ignore */ }
    throw new Error(`Function ${fnName} returned ${res.status} ${res.statusText}\n${errText}`);
  }
  
  const blob = await res.blob();

  if (expectedTypePrefix && !contentType.startsWith(expectedTypePrefix)) {
    console.warn(`Warning: Content-Type is "${contentType}", not the expected "${expectedTypePrefix}*".`);
  }

  return blob;
}