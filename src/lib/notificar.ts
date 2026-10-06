import 'server-only'
import { admin } from './supabase/admin'
import { avisarTeamsPersona, enviarEmail } from './avisos'
import { APP_URL } from './formato'

export type TipoAviso = 'respuesta' | 'resuelto' | 'aprobacion' | 'otro'

interface TicketMinimo {
  id: string
  numero: number
  asunto: string
}

/** ¿Corresponde mandar mail según lo que eligió la persona? Los pedidos de aprobación salen siempre. */
function mailPermitido(preferencia: string, tipo: TipoAviso) {
  if (tipo === 'aprobacion') return true
  if (preferencia === 'nada') return false
  if (preferencia === 'resuelto') return tipo === 'resuelto'
  return true
}

/**
 * Avisa a una persona por los tres canales: campanita dentro de la app, mail (según su preferencia)
 * y Teams (si está configurado). Nunca interrumpe la acción principal si algo falla.
 */
export async function avisarPersona(p: {
  perfilId?: string | null
  email?: string
  ticket: TicketMinimo
  tipo: TipoAviso
  titulo: string
  texto: string
  url?: string
}) {
  try {
    const db = admin()
    let email = (p.email ?? '').toLowerCase()
    let preferencia = 'todo'
    if (p.perfilId) {
      const { data } = await db.from('perfiles').select('email,avisos_mail').eq('id', p.perfilId).maybeSingle()
      if (data) {
        email = data.email
        preferencia = data.avisos_mail ?? 'todo'
        await db.from('notificaciones').insert({ perfil_id: p.perfilId, ticket_id: p.ticket.id, texto: `#${p.ticket.numero} · ${p.titulo}`.slice(0, 300) })
      }
    }
    if (!email.includes('@')) return
    const url = p.url ?? `${APP_URL}/tickets/${p.ticket.id}`
    await Promise.all([
      mailPermitido(preferencia, p.tipo)
        ? enviarEmail(email, `[#${p.ticket.numero}] ${p.titulo}: ${p.ticket.asunto}`, `${p.texto}\n\n${url}`)
        : Promise.resolve(false),
      avisarTeamsPersona(email, `#${p.ticket.numero} · ${p.titulo}`, p.texto, url),
    ])
  } catch (e) {
    console.error('No se pudo avisar a la persona:', e)
  }
}

/** Todos los interesados en un ticket del lado del usuario: solicitante, beneficiario y personas en copia. */
export async function avisarInteresados(
  t: TicketMinimo & { solicitante_id: string | null; solicitante_email: string; beneficiario_id?: string | null },
  aviso: { tipo: TipoAviso; titulo: string; texto: string },
  exceptoId?: string,
) {
  const { data: seg } = await admin().from('ticket_seguidores').select('perfil_id').eq('ticket_id', t.id)
  const ids = new Set<string>([t.solicitante_id, t.beneficiario_id, ...(seg ?? []).map((s) => s.perfil_id as string)].filter((x): x is string => !!x))
  if (exceptoId) ids.delete(exceptoId)
  const tareas = [...ids].map((perfilId) => avisarPersona({ perfilId, ticket: t, ...aviso }))
  // Quien escribió por mail y todavía no tiene cuenta también recibe el aviso.
  if (!t.solicitante_id && t.solicitante_email.includes('@')) tareas.push(avisarPersona({ email: t.solicitante_email, ticket: t, ...aviso }))
  await Promise.all(tareas)
}
