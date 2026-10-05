import 'server-only'
import { admin } from './supabase/admin'
import { clasificar } from './ia'
import { avisarTeams, enviarEmail } from './avisos'
import { APP_URL } from './formato'
import { etiquetaPrioridad, type Canal, type Ticket } from './tipos'

export const MAX_ADJUNTO = 4 * 1024 * 1024

export function archivosDe(form: FormData): File[] {
  return form
    .getAll('archivos')
    .filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_ADJUNTO)
    .slice(0, 5)
}

export async function subirAdjuntos(ticketId: string, mensajeId: string | null, archivos: File[]) {
  if (!archivos.length) return
  const db = admin()
  for (const a of archivos) {
    const limpio = a.name.replace(/[^\w.\-]+/g, '_').slice(-80)
    const ruta = `${ticketId}/${crypto.randomUUID()}-${limpio}`
    const { error } = await db.storage.from('adjuntos').upload(ruta, a, { contentType: a.type || 'application/octet-stream' })
    if (error) {
      console.error('No se pudo subir el adjunto:', error.message)
      continue
    }
    await db.from('adjuntos').insert({
      ticket_id: ticketId,
      mensaje_id: mensajeId,
      nombre: a.name.slice(0, 200),
      ruta,
      tamano: a.size,
      tipo: a.type || '',
    })
  }
}

export async function registrarEvento(ticketId: string, autor: string, detalle: string) {
  await admin().from('eventos').insert({ ticket_id: ticketId, autor_nombre: autor, detalle })
}

/** Único punto de alta de tickets: lo usan el portal y la entrada por email / Teams. */
export async function crearTicket(e: {
  asunto: string
  descripcion: string
  canal: Canal
  solicitanteId?: string | null
  email: string
  nombre: string
}): Promise<Ticket> {
  const db = admin()
  const { data: sectores } = await db.from('sectores').select('id,nombre,descripcion').eq('activo', true).order('orden')
  const ia = await clasificar(e.asunto, e.descripcion, sectores ?? [])

  const { data, error } = await db
    .from('tickets')
    .insert({
      asunto: e.asunto.slice(0, 200),
      descripcion: e.descripcion.slice(0, 20000),
      canal: e.canal,
      solicitante_id: e.solicitanteId ?? null,
      solicitante_email: e.email.toLowerCase(),
      solicitante_nombre: e.nombre,
      sector_id: ia.sectorId,
      prioridad: ia.prioridad ?? 'media',
      ia_sector: ia.sugerido,
      ia_confianza: ia.confianza,
      ia_motivo: ia.motivo,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`No se pudo crear el ticket: ${error?.message}`)
  const t = data as Ticket

  const sector = (sectores ?? []).find((s) => s.id === t.sector_id)?.nombre
  await registrarEvento(
    t.id,
    'Sistema',
    sector
      ? `Derivado por IA a ${sector} (confianza ${Math.round((ia.confianza ?? 0) * 100)}%): ${ia.motivo}`
      : `Sin derivar, queda en triage. ${ia.sugerido ? `Sugerencia de la IA: ${ia.sugerido}. ` : ''}${ia.motivo}`,
  )

  const url = `${APP_URL}/tickets/${t.id}`
  await Promise.all([
    avisarTeams(
      `Nuevo ticket #${t.numero}: ${t.asunto}`,
      [
        `Solicitante: ${t.solicitante_nombre || t.solicitante_email}`,
        `Sector: ${sector ?? 'Triage (sin derivar)'} · Prioridad: ${etiquetaPrioridad(t.prioridad)} · Canal: ${t.canal}`,
      ],
      url,
    ),
    enviarEmail(
      t.solicitante_email,
      `[#${t.numero}] Recibimos tu pedido: ${t.asunto}`,
      `Hola ${t.solicitante_nombre || ''},\n\nRegistramos tu pedido con el número #${t.numero}. Podés seguirlo en ${url}\n\nSi respondés este mail sin cambiar el asunto, tu respuesta se agrega al ticket.`,
    ),
  ])
  return t
}

/** Quita el texto citado de una respuesta por mail (heurística simple). */
export function limpiarRespuesta(texto: string) {
  const lineas = texto.replace(/\r/g, '').split('\n')
  const corte = lineas.findIndex((l) =>
    /^(De:|From:|-{2,}\s*Mensaje original|-{2,}\s*Original Message|El .{5,80} escribió:|On .{5,80} wrote:|_{10,})/i.test(l.trim()),
  )
  const util = (corte > 0 ? lineas.slice(0, corte) : lineas).filter((l) => !l.trim().startsWith('>'))
  return util.join('\n').trim()
}
