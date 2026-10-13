import 'server-only'
import { randomBytes } from 'node:crypto'
import { admin } from './supabase/admin'
import { crearTicket, registrarEvento } from './tickets'
import { avisarPersona } from './notificar'
import { avisarTeams, enviarEmail } from './avisos'
import { auditar } from './auditoria'
import { leerConfig } from './config'
import { APP_URL, fecha } from './formato'
import { proximaRecertificacion, type Acceso } from './tipos'

// Accesos otorgados por pedidos (VPN fuera de horario, AWS, Azure DevOps, Sentry…).
// La base los registra sola al resolverse el pedido (006_accesos_y_conocimiento.sql).
// Acá: aviso antes del vencimiento, ticket de revocación al vencer y reconfirmación de los que no tienen fecha de fin.

type Actor = { id: string; nombre: string; email: string } | null
const DIAS_AVISO = 3
const persona = (a: Acceso) => a.persona_nombre || a.persona_email || 'la persona'

async function ticketOrigen(a: Acceso) {
  if (!a.ticket_id) return null
  const { data } = await admin().from('tickets').select('id,numero,asunto,sector_id').eq('id', a.ticket_id).maybeSingle()
  return data as { id: string; numero: number; asunto: string; sector_id: string | null } | null
}

/**
 * Abre el ticket para quitar el acceso. Primero "toma" el acceso (vigente → revocación pendiente),
 * así dos revisiones simultáneas no generan dos tickets.
 */
export async function pedirRevocacion(a: Acceso, motivo: string, actor: Actor) {
  const db = admin()
  const { data: tomado } = await db.from('accesos').update({ estado: 'revocacion_pendiente' }).eq('id', a.id).eq('estado', 'vigente').select('id')
  if (!tomado?.length) return null

  const origen = await ticketOrigen(a)
  const t = await crearTicket({
    asunto: `Quitar acceso: ${a.sistema} — ${persona(a)}`.slice(0, 200),
    descripcion: [
      `Hay que quitar este acceso (${motivo}).`,
      '',
      `Persona: ${persona(a)}${a.persona_email && a.persona_nombre ? ` (${a.persona_email})` : ''}`,
      `Acceso: ${a.sistema}`,
      `Otorgado: ${fecha(a.otorgado_en)}${origen ? ` en el pedido #${origen.numero}` : ''}`,
      a.hasta ? `Vencía: ${fecha(a.hasta)}` : 'Sin fecha de fin',
      '',
      'Al resolver este ticket, el acceso queda registrado como quitado.',
    ].join('\n'),
    canal: 'programado',
    email: '',
    nombre: 'Control de accesos',
    sectorId: a.sector_id ?? origen?.sector_id ?? null,
    prioridad: 'alta',
    sinIA: true,
    avisarSolicitante: false,
    claveExterna: `acceso:${a.id}`,
  })
  await db.from('accesos').update({ revocar_ticket_id: t.id }).eq('id', a.id)
  if (origen) await registrarEvento(origen.id, actor?.nombre || 'Sistema', `Se pidió quitar el acceso (${motivo}): ticket #${t.numero}`)
  await auditar(actor, 'Pidió quitar acceso', 'acceso', a.sistema, `${persona(a)} · ${motivo} · ticket #${t.numero}`)
  return t
}

/** Reconfirmación de un acceso sin fecha de fin: lo decide el responsable desde el enlace del mail o desde la app. */
export async function registrarRecertificacion(a: Acceso, sigue: boolean, actor: Actor, nota = '') {
  const db = admin()
  if (sigue) {
    await db.from('accesos').update({ recertificado_en: new Date().toISOString(), recertificar_token: null, recertificar_pedido_en: null, ...(nota ? { notas: nota.slice(0, 500) } : {}) }).eq('id', a.id)
    await auditar(actor, 'Reconfirmó acceso', 'acceso', a.sistema, `${persona(a)}${nota ? ` · ${nota}` : ''}`)
    if (a.ticket_id) await registrarEvento(a.ticket_id, actor?.nombre || 'Sistema', `Acceso reconfirmado: sigue haciendo falta${nota ? ` (${nota})` : ''}`)
    return null
  }
  await db.from('accesos').update({ recertificar_token: null, ...(nota ? { notas: nota.slice(0, 500) } : {}) }).eq('id', a.id)
  return pedirRevocacion(a, `en la reconfirmación se indicó que ya no hace falta${nota ? `: ${nota}` : ''}`, actor)
}

/** Revisión periódica (la llama revisar() en sla.ts). */
export async function revisarAccesos() {
  const db = admin()
  const res = { avisosAcceso: 0, revocaciones: 0, reconfirmaciones: 0 }
  const ahora = Date.now()
  const conf = await leerConfig<{ aviso_dias: number }>('accesos', { aviso_dias: DIAS_AVISO })
  const limite = new Date(ahora + Math.max(1, conf.aviso_dias) * 86400000).toISOString()
  const iso = new Date(ahora).toISOString()

  // 1. Aviso a la persona antes del vencimiento
  const { data: proximos } = await db.from('accesos').select('*').eq('estado', 'vigente').is('aviso_enviado_en', null)
    .not('hasta', 'is', null).gt('hasta', iso).lte('hasta', limite).limit(100)
  for (const a of (proximos ?? []) as Acceso[]) {
    const { data: tomado } = await db.from('accesos').update({ aviso_enviado_en: iso }).eq('id', a.id).is('aviso_enviado_en', null).select('id')
    if (!tomado?.length) continue
    const origen = await ticketOrigen(a)
    const texto = `Tu acceso "${a.sistema}" vence el ${fecha(a.hasta)}. Ese día se quita automáticamente.\n\nSi lo seguís necesitando, cargá un pedido nuevo antes de esa fecha${origen ? ' (podés copiar el anterior con "Cargar otro pedido igual")' : ''}.`
    if (origen && (a.persona_id || a.persona_email)) {
      await avisarPersona({ perfilId: a.persona_id, email: a.persona_email, ticket: origen, tipo: 'acceso', titulo: 'Tu acceso está por vencer', texto, url: `${APP_URL}/tickets/${origen.id}` })
    } else if (a.persona_email) {
      await enviarEmail(a.persona_email, `Tu acceso está por vencer: ${a.sistema}`, texto)
    }
    res.avisosAcceso++
  }

  // 2. Vencidos: se abre el ticket para quitarlos
  const { data: vencidos } = await db.from('accesos').select('*').eq('estado', 'vigente').not('hasta', 'is', null).lte('hasta', iso).limit(50)
  for (const a of (vencidos ?? []) as Acceso[]) {
    if (await pedirRevocacion(a, `venció el ${fecha(a.hasta)}`, null)) res.revocaciones++
  }

  // 3. Reconfirmación de accesos sin fecha de fin
  const [{ data: abiertos }, { data: cats }, { data: sectores }] = await Promise.all([
    db.from('accesos').select('*').eq('estado', 'vigente').is('hasta', null).is('recertificar_token', null).limit(300),
    db.from('categorias').select('id,recertificar_dias'),
    db.from('sectores').select('id,responsable_id'),
  ])
  const diasDe = new Map((cats ?? []).map((c) => [c.id as string, Number(c.recertificar_dias) || 90]))
  const responsableSector = new Map((sectores ?? []).map((s) => [s.id as string, s.responsable_id as string | null]))
  for (const a of (abiertos ?? []) as Acceso[]) {
    if (res.reconfirmaciones >= 30) break
    const dias = (a.categoria_id && diasDe.get(a.categoria_id)) || 90
    if (proximaRecertificacion(a, dias).getTime() > ahora) continue
    const token = randomBytes(24).toString('base64url')
    const { data: tomado } = await db.from('accesos').update({ recertificar_token: token, recertificar_pedido_en: iso }).eq('id', a.id).is('recertificar_token', null).select('id')
    if (!tomado?.length) continue
    const responsable = a.responsable_id ?? (a.sector_id ? responsableSector.get(a.sector_id) : null) ?? null
    const url = `${APP_URL}/recertificar/${token}`
    const texto = `${persona(a)} tiene este acceso desde el ${fecha(a.otorgado_en)}, sin fecha de fin:\n\n${a.sistema}\n\n¿Sigue haciendo falta? Respondé desde este enlace, sin ingresar a la app:`
    const origen = await ticketOrigen(a)
    if (responsable && origen) {
      await avisarPersona({ perfilId: responsable, ticket: origen, tipo: 'acceso', titulo: '¿Este acceso sigue haciendo falta?', texto, url })
    } else {
      await avisarTeams(`Reconfirmar acceso: ${a.sistema}`, [`${persona(a)} · sin responsable asignado para reconfirmarlo`], `${APP_URL}/accesos?ver=reconfirmar`)
    }
    res.reconfirmaciones++
  }
  return res
}
