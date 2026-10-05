import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Cliente con la service role key: saltea la seguridad por fila.
 * Usar solo en el servidor y siempre después de validar quién hace la acción.
 */
export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
