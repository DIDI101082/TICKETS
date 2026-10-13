import 'server-only'

// Ficha de la persona desde Accusys Cyber (solo lectura).
// La consulta la hace este servidor con una clave propia; el navegador nunca la ve.
// Variables: CYBER_SUPABASE_URL, CYBER_SUPABASE_ANON_KEY y CYBER_CONTEXTO_TOKEN.

export interface EquipoCyber {
  id: string
  codigo: string | null
  categoria: string | null
  marca: string | null
  modelo: string | null
  serie: string | null
  entregado: string | null
  hostname: string | null
  so: string | null
  ultimo_reporte: string | null
  antivirus: boolean | null
  cifrado: string | null
  reinicio_pendiente: boolean | null
  ultimo_parche: string | null
  ubicacion: string | null
  eset: { abiertas: number; ultima: { nombre: string | null; severidad: string | null; fecha: string } | null } | null
}

export interface ContextoCyber {
  encontrado: boolean
  empleado?: { id: string; nombre: string; area: string | null; puesto: string | null; activo: boolean }
  equipos?: EquipoCyber[]
  licencias?: string[]
  mfa?: { activo: boolean; metodos: string[]; admin: boolean; actualizado: string }
  ad?: { usuario: string; habilitada: boolean | null; bloqueada: boolean | null; ultimo_ingreso: string | null; clave_cambiada: string | null; clave_no_vence: boolean | null }
  m365?: { habilitada: boolean; ultimo_ingreso: string | null }
}

export const cyberConfigurado = () =>
  !!(process.env.CYBER_SUPABASE_URL && process.env.CYBER_SUPABASE_ANON_KEY && process.env.CYBER_CONTEXTO_TOKEN)

export async function contextoDe(email: string, ticket: string): Promise<{ datos?: ContextoCyber; error?: string }> {
  if (!cyberConfigurado()) return { error: 'no_configurado' }
  const base = process.env.CYBER_SUPABASE_URL!.replace(/\/$/, '')
  const anon = process.env.CYBER_SUPABASE_ANON_KEY!
  try {
    const r = await fetch(`${base}/rest/v1/rpc/tickets_contexto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: anon, authorization: `Bearer ${anon}` },
      body: JSON.stringify({ p_token: process.env.CYBER_CONTEXTO_TOKEN, p_email: email, p_ticket: ticket }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (r.status === 401 || r.status === 403) return { error: 'La clave de Accusys Cyber no es válida. Generá una nueva con tickets_nuevo_token().' }
    if (r.status === 404) return { error: 'Falta ejecutar tickets-contexto.sql en Accusys Cyber.' }
    if (!r.ok) return { error: `Accusys Cyber respondió ${r.status}.` }
    return { datos: (await r.json()) as ContextoCyber }
  } catch {
    return { error: 'Accusys Cyber no respondió a tiempo.' }
  }
}
