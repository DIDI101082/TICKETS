import 'server-only'
import { admin } from './supabase/admin'
import { guardarConfig, leerConfig } from './config'

// Personas desde Entra ID (Microsoft Graph): nombre, área, puesto, jefe y cuentas deshabilitadas.
// Usa una app registrada en Entra con el permiso de APLICACIÓN User.Read.All (con consentimiento de administrador).
// Variables en Vercel: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (Secret).
// Opcional: ENTRA_DOMINIOS=accusys.com.ar,accusystechnology.com (si no, se toman todos los miembros del directorio).

export interface ConfigEntra {
  activo: boolean
  desactivar: boolean
  ultimo: string | null
  resultado: Record<string, unknown> | null
  error: string | null
}
export const CONFIG_ENTRA: ConfigEntra = { activo: false, desactivar: true, ultimo: null, resultado: null, error: null }
export const leerEntra = () => leerConfig<ConfigEntra>('entra', CONFIG_ENTRA)

export const entraConfigurado = () => !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)

async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string }
  if (!r.ok || !j.access_token) throw new Error(`Entra ID rechazó las credenciales: ${j.error_description?.split('\r\n')[0] ?? j.error ?? r.status}`)
  return j.access_token
}

interface UsuarioGraph {
  id: string
  displayName: string | null
  mail: string | null
  userPrincipalName: string
  department: string | null
  jobTitle: string | null
  accountEnabled: boolean
  userType: string | null
  manager?: { id: string } | null
}

export interface PersonaEntra {
  entra_id: string
  email: string
  nombre: string
  area: string
  puesto: string
  jefe_entra_id: string | null
  activo: boolean
}

export async function leerPersonasEntra(): Promise<{ personas: PersonaEntra[]; total: number; descartados: number }> {
  const t = await token()
  const campos = 'id,displayName,mail,userPrincipalName,department,jobTitle,accountEnabled,userType'
  let url: string | null = `https://graph.microsoft.com/v1.0/users?$select=${campos}&$expand=manager($select=id)&$top=100`
  const todos: UsuarioGraph[] = []
  for (let paginas = 0; url && paginas < 200; paginas++) {
    const r: Response = await fetch(url, { headers: { authorization: `Bearer ${t}` }, cache: 'no-store', signal: AbortSignal.timeout(20000) })
    const j = (await r.json().catch(() => ({}))) as { value?: UsuarioGraph[]; '@odata.nextLink'?: string; error?: { message?: string } }
    if (!r.ok) {
      throw new Error(r.status === 403
        ? 'La app de Entra no tiene permiso para leer usuarios: agregale User.Read.All (de aplicación) y dale consentimiento de administrador.'
        : `Error de Microsoft Graph: ${j.error?.message ?? r.status}`)
    }
    todos.push(...(j.value ?? []))
    url = j['@odata.nextLink'] ?? null
  }

  const dominios = (process.env.ENTRA_DOMINIOS ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
  const personas: PersonaEntra[] = []
  for (const u of todos) {
    if (u.userType && u.userType !== 'Member') continue // invitados
    const email = (u.mail || (u.userPrincipalName.includes('#EXT#') ? '' : u.userPrincipalName)).toLowerCase()
    if (!email.includes('@')) continue
    if (dominios.length && !dominios.includes(email.split('@')[1])) continue
    personas.push({
      entra_id: u.id,
      email,
      nombre: (u.displayName ?? '').trim().slice(0, 120),
      area: (u.department ?? '').trim().slice(0, 120),
      puesto: (u.jobTitle ?? '').trim().slice(0, 120),
      jefe_entra_id: u.manager?.id ?? null,
      activo: u.accountEnabled,
    })
  }
  return { personas, total: todos.length, descartados: todos.length - personas.length }
}

/** Lee Entra y aplica los cambios en Desk. Guarda el resultado para mostrarlo en Integraciones. */
export async function sincronizarEntra(): Promise<ConfigEntra> {
  const conf = await leerEntra()
  const ahora = new Date().toISOString()
  try {
    if (!entraConfigurado()) throw new Error('Faltan AZURE_TENANT_ID, AZURE_CLIENT_ID y AZURE_CLIENT_SECRET en Vercel.')
    const { personas, total, descartados } = await leerPersonasEntra()
    // Nunca aplicar con una respuesta vacía: dejaría a todos como dados de baja.
    if (!personas.length) throw new Error(`Entra ID devolvió ${total} usuarios pero ninguno pasó el filtro (revisá ENTRA_DOMINIOS). No se aplicó ningún cambio.`)
    const { data, error } = await admin().rpc('tk_entra_sincronizar', { p: personas, p_desactivar: conf.desactivar })
    if (error) throw new Error(/tk_entra_sincronizar/.test(error.message) ? 'Falta ejecutar supabase/010_entra_id.sql en Supabase.' : error.message)
    const nuevo = { ...conf, ultimo: ahora, resultado: { ...(data as Record<string, unknown>), descartados }, error: null }
    await guardarConfig('entra', nuevo)
    return nuevo
  } catch (e) {
    const nuevo = { ...conf, ultimo: ahora, error: String((e as Error)?.message ?? e).slice(0, 400) }
    await guardarConfig('entra', nuevo)
    return nuevo
  }
}

/** Revisión periódica: como mucho una vez por hora, si está activada. */
export async function sincronizarEntraSiToca() {
  const conf = await leerEntra()
  if (!conf.activo || !entraConfigurado()) return null
  if (conf.ultimo && Date.now() - new Date(conf.ultimo).getTime() < 55 * 60000) return null
  return sincronizarEntra()
}
