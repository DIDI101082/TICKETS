import 'server-only'
import { admin } from './supabase/admin'
import { avisarTeamsPersona, enviarEmail } from './avisos'
import { APP_URL } from './formato'
import { leerHorario } from './config'
import { horaEnZona, ZONA, type Bloqueo, type Lugar } from './turnos-calc'

// Turnos con el CAU: la persona reserva día y hora (presencial o remoto) y el equipo los ve en su agenda.

export const MOTIVOS = [
  'Recambio o entrega de equipo',
  'Revisión de equipo (lento, ruidos, batería)',
  'Instalación o configuración de programas',
  'Configurar el celular (correo, Teams, Authenticator)',
  'Devolución de equipo',
  'Otro',
] as const

export interface Turno {
  id: string
  lugar_id: string
  inicio: string
  fin: string
  perfil_id: string | null
  persona_nombre: string
  persona_email: string
  motivo: string
  detalle: string
  equipo: string
  ticket_id: string | null
  estado: 'reservado' | 'cancelado' | 'atendido' | 'ausente'
  tecnico_id: string | null
  nota_tecnico: string
  recordado_en: string | null
  creado_en: string
}

export const zonaTurnos = async () => (await leerHorario()).zona || ZONA

export async function datosAgenda(desde: Date, hasta: Date) {
  const db = admin()
  const [{ data: l }, { data: b }, { data: o }] = await Promise.all([
    db.from('turno_lugares').select('*').order('orden').order('nombre'),
    db.from('turno_bloqueos').select('*').gte('hasta', desde.toISOString().slice(0, 10)).order('desde'),
    db.from('turnos').select('lugar_id,inicio,fin').eq('estado', 'reservado').gte('fin', desde.toISOString()).lte('inicio', hasta.toISOString()),
  ])
  return { lugares: (l ?? []) as Lugar[], bloqueos: (b ?? []) as Bloqueo[], ocupados: (o ?? []) as { lugar_id: string; inicio: string; fin: string }[] }
}

export function cuando(t: Pick<Turno, 'inicio'>, zona = ZONA) {
  const d = new Date(t.inicio)
  const dia = new Intl.DateTimeFormat('es-AR', { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return `${dia} a las ${horaEnZona(d, zona)}`
}

/** Mail y Teams a la persona: confirmación, recordatorio o cancelación. */
export async function avisarTurno(t: Turno, lugar: Pick<Lugar, 'nombre' | 'indicaciones' | 'modalidad'>, tipo: 'confirmado' | 'recordatorio' | 'cancelado', motivoCancelacion = '') {
  if (!t.persona_email.includes('@')) return
  const zona = await zonaTurnos()
  const url = `${APP_URL}/turnos`
  const titulo = tipo === 'confirmado' ? 'Turno confirmado' : tipo === 'recordatorio' ? 'Recordatorio de tu turno con el CAU' : 'Se canceló tu turno'
  const texto = [
    `${tipo === 'cancelado' ? 'Se canceló el turno del' : 'Turno:'} ${cuando(t, zona)} · ${lugar.nombre}`,
    `Motivo: ${t.motivo}${t.equipo ? ` · Equipo ${t.equipo}` : ''}`,
    tipo !== 'cancelado' && lugar.indicaciones ? `\n${lugar.indicaciones}` : '',
    tipo === 'cancelado' && motivoCancelacion ? `\n${motivoCancelacion}` : '',
    tipo === 'confirmado' ? `\nPodés agregarlo a tu calendario o cancelarlo desde ${url}` : tipo === 'recordatorio' ? `\nSi no podés venir, cancelalo desde ${url} así otra persona usa el horario.` : `\nPodés reservar otro desde ${url}`,
  ].filter(Boolean).join('\n')
  await Promise.all([enviarEmail(t.persona_email, `${titulo}: ${cuando(t, zona)}`, texto), avisarTeamsPersona(t.persona_email, titulo, texto, url)])
}

/** Recordatorio el día anterior (lo llama la revisión periódica). */
export async function recordarTurnos() {
  const db = admin()
  const ahora = Date.now()
  const { data } = await db
    .from('turnos')
    .select('*, turno_lugares(nombre,indicaciones,modalidad)')
    .eq('estado', 'reservado')
    .is('recordado_en', null)
    .gt('inicio', new Date(ahora + 2 * 3600000).toISOString())
    .lt('inicio', new Date(ahora + 24 * 3600000).toISOString())
    .limit(100)
  let n = 0
  for (const t of data ?? []) {
    // Los que se reservaron hace menos de 3 horas ya tienen la confirmación fresca.
    if (ahora - new Date(t.creado_en).getTime() < 3 * 3600000) continue
    const { data: tomado } = await db.from('turnos').update({ recordado_en: new Date().toISOString() }).eq('id', t.id).is('recordado_en', null).select('id')
    if (!tomado?.length) continue
    await avisarTurno(t as Turno, t.turno_lugares as Lugar, 'recordatorio')
    n++
  }
  return n
}
