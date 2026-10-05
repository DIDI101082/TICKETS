import 'server-only'
import { admin } from './supabase/admin'
import { clasificar } from './ia'
import { avisarTeams, enviarEmail } from './avisos'
import { leerOpciones } from './config'
import { claves, coincidencias } from './texto'
import { APP_URL } from './formato'
import { etiquetaPrioridad, type Canal, type Categoria, type Dato, type Prioridad, type Ticket } from './tipos'

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

/** Único punto de alta de tickets: portal, email, Teams, monitoreo y programados. */
export async function crearTicket(e: {
  asunto: string
  descripcion: string
  canal: Canal
  solicitanteId?: string | null
  email: string
  nombre: string
  categoriaId?: string | null
  datos?: Dato[]
  sectorId?: string | null
  prioridad?: Prioridad | null
  sinIA?: boolean
  claveExterna?: string | null
  avisarSolicitante?: boolean
}): Promise<Ticket> {
  const db = admin()
  const email = e.email.toLowerCase()

  const [{ data: sectores }, { data: cat }, { data: perfil }] = await Promise.all([
    db.from('sectores').select('id,nombre,descripcion').eq('activo', true).order('orden'),
    e.categoriaId ? db.from('categorias').select('*').eq('id', e.categoriaId).maybeSingle() : Promise.resolve({ data: null }),
    e.solicitanteId ? db.from('perfiles').select('organizacion_id').eq('id', e.solicitanteId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const categoria = cat as Categoria | null

  // Organización: la del perfil o, si escribió por mail sin cuenta, la que tenga ese dominio.
  let organizacionId: string | null = perfil?.organizacion_id ?? null
  if (!organizacionId && email.includes('@')) {
    const dominio = email.split('@')[1]
    const { data: orgs } = await db.from('organizaciones').select('id,dominios').eq('activo', true)
    organizacionId =
      (orgs ?? []).find((o) => String(o.dominios).toLowerCase().split(',').map((d) => d.trim()).includes(dominio))?.id ?? null
  }

  let sectorId = e.sectorId ?? categoria?.sector_id ?? null
  let prioridad = e.prioridad ?? categoria?.prioridad ?? null
  const datos = e.datos ?? []
  let ia = { sugerido: null as string | null, confianza: null as number | null, motivo: '' }
  let origen = sectorId ? (e.sectorId ? 'Sector definido por el origen' : `Sector definido por la categoría ${categoria?.nombre}`) : ''

  if (!e.sinIA && (!sectorId || !prioridad)) {
    const contexto = [e.descripcion, ...datos.map((d) => `${d.etiqueta}: ${d.valor}`)].join('\n')
    const c = await clasificar(e.asunto, contexto, sectores ?? [])
    ia = { sugerido: c.sugerido, confianza: c.confianza, motivo: c.motivo }
    if (!sectorId && c.sectorId) {
      sectorId = c.sectorId
      origen = `Derivado por IA (confianza ${Math.round((c.confianza ?? 0) * 100)}%): ${c.motivo}`
    }
    prioridad = prioridad ?? c.prioridad
  }

  const { data, error } = await db
    .from('tickets')
    .insert({
      asunto: e.asunto.slice(0, 200),
      descripcion: e.descripcion.slice(0, 20000),
      canal: e.canal,
      solicitante_id: e.solicitanteId ?? null,
      solicitante_email: email,
      solicitante_nombre: e.nombre,
      sector_id: sectorId,
      prioridad: prioridad ?? 'media',
      organizacion_id: organizacionId,
      categoria_id: categoria?.id ?? null,
      datos,
      equipo: datos.find((d) => /inventario|equipo/i.test(d.etiqueta))?.valor.slice(0, 80) ?? '',
      confidencial: categoria?.confidencial ?? false,
      aprobacion_estado: categoria?.requiere_aprobacion ? 'pendiente' : 'no_requiere',
      clave_externa: e.claveExterna ?? null,
      ia_sector: ia.sugerido,
      ia_confianza: ia.confianza,
      ia_motivo: ia.motivo || null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`No se pudo crear el ticket: ${error?.message}`)
  const t = data as Ticket

  const sector = (sectores ?? []).find((s) => s.id === t.sector_id)?.nombre
  await registrarEvento(
    t.id,
    'Sistema',
    sector ? `Sector ${sector}. ${origen}` : `Sin derivar, queda en triage. ${ia.sugerido ? `Sugerencia de la IA: ${ia.sugerido}. ` : ''}${ia.motivo}`,
  )
  if (t.aprobacion_estado === 'pendiente') await registrarEvento(t.id, 'Sistema', 'Requiere aprobación: falta designar quién aprueba')

  const url = `${APP_URL}/tickets/${t.id}`
  await Promise.all([
    detectarIncidente(t, sector ?? null),
    avisarTeams(
      `Nuevo ticket #${t.numero}: ${t.confidencial ? '(confidencial)' : t.asunto}`,
      [
        `Solicitante: ${t.solicitante_nombre || t.solicitante_email}`,
        `Sector: ${sector ?? 'Triage (sin derivar)'} · Prioridad: ${etiquetaPrioridad(t.prioridad)} · Canal: ${t.canal}`,
      ],
      url,
    ),
    e.avisarSolicitante === false || !email.includes('@')
      ? Promise.resolve(false)
      : enviarEmail(
          email,
          `[#${t.numero}] Recibimos tu pedido: ${t.asunto}`,
          `Hola ${t.solicitante_nombre || ''},\n\nRegistramos tu pedido con el número #${t.numero}. Podés seguirlo en ${url}\n\nSi respondés este mail sin cambiar el asunto, tu respuesta se agrega al ticket.`,
        ),
  ])
  return t
}

/** Varios tickets parecidos del mismo sector en poco tiempo: se marcan como posible incidente y se avisa. */
async function detectarIncidente(t: Ticket, sector: string | null) {
  try {
    if (t.canal === 'programado') return
    const op = await leerOpciones()
    if (op.incidente_cantidad < 2) return
    const db = admin()
    const desde = new Date(Date.now() - op.incidente_minutos * 60000).toISOString()
    let q = db.from('tickets').select('id,asunto').neq('id', t.id).gte('creado_en', desde).limit(200)
    q = t.sector_id ? q.eq('sector_id', t.sector_id) : q.is('sector_id', null)
    const { data } = await q
    const mias = claves(t.asunto)
    if (!mias.length) return
    const parecidos = (data ?? []).filter((x) => coincidencias(mias, claves(String(x.asunto))) >= 1)
    const total = parecidos.length + 1
    if (total < op.incidente_cantidad) return

    await db.from('tickets').update({ incidente: true }).in('id', [t.id, ...parecidos.map((p) => p.id)])
    await registrarEvento(t.id, 'Sistema', `Posible incidente: ${total} tickets parecidos en ${op.incidente_minutos} minutos`)
    // Se avisa al cruzar el umbral y después cada cinco tickets, para no saturar el canal.
    if (total === op.incidente_cantidad || total % 5 === 0) {
      await avisarTeams(
        `Posible incidente: ${total} tickets parecidos en ${op.incidente_minutos} minutos`,
        [`Sector: ${sector ?? 'Triage'}`, `Último: #${t.numero} ${t.asunto}`],
        `${APP_URL}/agente?vista=incidentes`,
      )
    }
  } catch (e) {
    console.error('Detección de incidentes falló:', e)
  }
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

/** Aviso al solicitante cuando su ticket queda resuelto, con el enlace a la encuesta. */
export async function avisarResuelto(t: Ticket) {
  if (!t.solicitante_email.includes('@') || t.canal === 'monitoreo' || t.canal === 'programado') return
  await enviarEmail(
    t.solicitante_email,
    `[#${t.numero}] Tu pedido fue resuelto: ${t.asunto}`,
    `Hola ${t.solicitante_nombre || ''},\n\nMarcamos tu pedido #${t.numero} como resuelto.\n\n¿Cómo te atendimos? Contanos en ${APP_URL}/tickets/${t.id}#encuesta (te lleva diez segundos).\n\nSi el problema sigue, respondé este mail y lo reabrimos.`,
  )
}
