// Supabase client (server-side only, SERVICE_ROLE key).
// Фронтенд НИКОГДА не обращается к БД напрямую — только через /api функции.
import './ws-polyfill.js';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[supabase] SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не заданы');
}

export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: {} },
  global: { fetch: (...args) => fetch(...args) },
});

export default supabase;
