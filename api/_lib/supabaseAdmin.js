// api/_lib/supabaseAdmin.js
// Supabase admin client using service-role key — BYPASSES RLS.
// Used server-side only. Never imported by frontend code.
import { createClient } from '@supabase/supabase-js'

export function getSupabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
