'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { archivosDe, avisarResuelto, registrarEvento, subirAdjuntos } from '@/lib/tickets'
import { enviarEmail } from '@/lib/avisos'
import { auditar } from '@/lib/auditoria'
import { redactarBorrador, resumir, type Hilo } from '@/lib/ia'
import { claves, coincidencias } from '@/lib/texto'
import { APP_URL } from '@/lib/formato'
import { ESTADOS, PRIORIDADES, etiquetaEstado, etiquetaPrioridad, type Mensaje, type Ticket } from '@/lib/tipos'

// Toda acción empieza leyendo el ticket con la sesión del usuario: si no tiene permiso, no lo ve.
async function ticketVisible(ticketId: string) {
  const s = await sesion()
  const { data } = await s.db.from('tickets').select('*').eq('id', ticketId).maybeSingle()
  if (!data) redirect('/')
  return { ...s, t: data as Ticket }
}

async function ticketStaff(ticketId: string) {
  const s = await ticketVisible(ticketId)
  if (!s.staff) redirect(`/tickets/${ticketId}`)
  return s
}

function volver(ticketId: string): never {
  revalidatePath(`/tickets/${ticketId}`)
  redirect(`/tickets/${ticketId}`)
}

export async function responder(ticketId: string, form: FormData) {
  const { perfil, staff, t } = await ticketVisible(ticketId)
  if (!staff && t.estado === 'cerrado') volver(ticketId)

  const cuerpo = String(form.get('cuerpo') || '').trim()
  const archivos = archivosDe(form)
  if (!cuerpo && !archivos.length) volver(ticketId)

  const interno = staff && form.get('interno') === 'on'
  const db = admin()
  const { data: m, error } = await db
    .from('mensajes')
    .insert({
      ticket_id: ticketId,
      autor_id: perfil.id,
      autor_nombre: perfil.nombre || perfil.email,
      de_staff: staff,
      interno,
      cuerpo: (cuerpo || '(adjunto)').slice(0, 20000),
    })
    .select('id')
    .single()
  if (error || !m) throw new Error(`No se pudo guardar la respuesta: ${error?.message}`)
  await subirAdjuntos(ticketId, m.id, archivos)

  if (staff && !interno) {
    const pedido = String(form.get('estado_tras') || '')
    const cambios: Record<string, string> = {}
    if (pedido === 'en_espera' || pedido === 'resuelto') cambios.estado = pedido
    else if (t.estado === 'abierto') cambios.estado = 'en_curso'
    if (!t.asignado_id) cambios.asignado_id = perfil.id

    if (Object.keys(cambios).length) {
      await db.from('tickets').update(cambios).eq('id', ticketId)
      if (cambios.estado) await registrarEvento(ticketId, perfil.nombre, `Estado: ${etiquetaEstado(t.estado)} → ${etiquetaEstado(cambios.estado)}`)
      if (cambios.asignado_id) await registrarEvento(ticketId, perfil.nombre, 'Tomó el ticket')
    }

    if (t.solicitante_email.includes('@')) {
      await enviarEmail(
        t.solicitante_email,
        `[#${t.numero}] Nueva respuesta: ${t.asunto}`,
        `${perfil.nombre} respondió tu pedido:\n\n${cuerpo}\n\nPodés verlo y contestar en ${APP_URL}/tickets/${t.id} o respondiendo este mail sin cambiar el asunto.`,
      )
    }
    if (cambios.estado === 'resuelto') await avisarResuelto(t)
  }
  volver(ticketId)
}

export async function actualizar(ticketId: string, form: FormData) {
  const { perfil, esAdmin, t } = await ticketStaff(ticketId)
  const db = admin()

  const estado = String(form.get('estado') || '')
  const prioridad = String(form.get('prioridad') || '')
  const sector = String(form.get('sector_id') || '') || null
  const asignado = String(form.get('asignado_id') || '') || null
  const equipo = String(form.get('equipo') || '').trim().slice(0, 80)
  const confidencial = form.get('confidencial') === 'on'

  const cambios: Record<string, string | boolean | null> = {}
  const notas: string[] = []

  if (ESTADOS.some((e) => e.valor === estado) && estado !== t.estado) {
    cambios.estado = estado
    notas.push(`Estado: ${etiquetaEstado(t.estado)} → ${etiquetaEstado(estado)}`)
  }
  if (PRIORIDADES.some((p) => p.valor === prioridad) && prioridad !== t.prioridad) {
    cambios.prioridad = prioridad
    notas.push(`Prioridad: ${etiquetaPrioridad(t.prioridad)} → ${etiquetaPrioridad(prioridad)}`)
  }
  if (sector !== t.sector_id) {
    cambios.sector_id = sector
    const { data: s } = sector ? await db.from('sectores').select('nombre').eq('id', sector).maybeSingle() : { data: null }
    notas.push(`Sector: ${s?.nombre ?? 'sin sector (triage)'}`)
  }
  if (asignado !== t.asignado_id) {
    cambios.asignado_id = asignado
    const { data: a } = asignado ? await db.from('perfiles').select('nombre').eq('id', asignado).maybeSingle() : { data: null }
    notas.push(`Asignado a: ${a?.nombre ?? 'nadie'}`)
  }
  if (equipo !== t.equipo) {
    cambios.equipo = equipo
    notas.push(`Equipo: ${equipo || 'sin equipo'}`)
  }
  if (confidencial !== t.confidencial) {
    cambios.confidencial = confidencial
    notas.push(confidencial ? 'Marcado como confidencial' : 'Dejó de ser confidencial')
  }

  if (Object.keys(cambios).length) {
    const { error } = await db.from('tickets').update(cambios).eq('id', ticketId)
    if (error) throw new Error(`No se pudo actualizar el ticket: ${error.message}`)
    await registrarEvento(ticketId, perfil.nombre, notas.join(' · '))
    await auditar(perfil, 'Modificó ticket', 'ticket', `#${t.numero}`, notas.join(' · '))
  }

  // Acceso explícito a tickets confidenciales: lo maneja un administrador o quien lo tiene asignado.
  if (form.get('con_accesos') === '1' && (esAdmin || t.asignado_id === perfil.id)) {
    const ids = form.getAll('acceso').map(String)
    await db.from('ticket_acceso').delete().eq('ticket_id', ticketId)
    if (ids.length) await db.from('ticket_acceso').insert(ids.map((p) => ({ ticket_id: ticketId, perfil_id: p })))
  }

  // Cerrar o resolver un incidente puede arrastrar a los tickets vinculados.
  const cierra = cambios.estado === 'resuelto' || cambios.estado === 'cerrado'
  if (cierra && form.get('propagar') === 'on') {
    const { data: hijos } = await db.from('tickets').select('*').eq('padre_id', ticketId).in('estado', ['abierto', 'en_curso', 'en_espera'])
    for (const h of (hijos ?? []) as Ticket[]) {
      await db.from('tickets').update({ estado: cambios.estado }).eq('id', h.id)
      await registrarEvento(h.id, perfil.nombre, `${etiquetaEstado(String(cambios.estado))} junto con el ticket principal #${t.numero}`)
      if (cambios.estado === 'resuelto') await avisarResuelto(h)
    }
  }
  if (cambios.estado === 'resuelto') await avisarResuelto(t)
  volver(ticketId)
}

export async function tomar(ticketId: string) {
  const { perfil, t } = await ticketStaff(ticketId)
  await admin()
    .from('tickets')
    .update({ asignado_id: perfil.id, ...(t.estado === 'abierto' ? { estado: 'en_curso' } : {}) })
    .eq('id', ticketId)
  await registrarEvento(ticketId, perfil.nombre, 'Tomó el ticket')
  volver(ticketId)
}

export async function cerrarPropio(ticketId: string) {
  const { perfil, t } = await ticketVisible(ticketId)
  if (t.solicitante_id === perfil.id && t.estado !== 'cerrado') {
    await admin().from('tickets').update({ estado: 'cerrado' }).eq('id', ticketId)
    await registrarEvento(ticketId, perfil.nombre, 'El solicitante cerró el ticket')
  }
  volver(ticketId)
}

// ---------- Encuesta de satisfacción ----------

export async function calificar(ticketId: string, form: FormData) {
  const { perfil, t } = await ticketVisible(ticketId)
  const puntaje = Math.round(Number(form.get('puntaje')))
  if (t.solicitante_id === perfil.id && ['resuelto', 'cerrado'].includes(t.estado) && puntaje >= 1 && puntaje <= 5) {
    await admin()
      .from('tickets')
      .update({ csat_puntaje: puntaje, csat_comentario: String(form.get('comentario') || '').trim().slice(0, 1000), csat_en: new Date().toISOString() })
      .eq('id', ticketId)
    await registrarEvento(ticketId, perfil.nombre, `Calificó la atención: ${puntaje} de 5`)
  }
  volver(ticketId)
}

// ---------- Aprobaciones ----------

export async function pedirAprobacion(ticketId: string, form: FormData) {
  const { perfil, t } = await ticketStaff(ticketId)
  const email = String(form.get('email') || '').trim().toLowerCase()
  const db = admin()
  const { data: aprobador } = await db.from('perfiles').select('id,nombre,email').ilike('email', email).maybeSingle()
  if (!aprobador) {
    await registrarEvento(ticketId, perfil.nombre, `No se pudo pedir aprobación: ${email || 'sin email'} no tiene cuenta en la mesa de ayuda`)
    volver(ticketId)
  }
  await db
    .from('tickets')
    .update({ aprobacion_estado: 'pendiente', aprobador_id: aprobador.id, aprobacion_nota: '', aprobacion_en: null, ...(t.estado !== 'en_espera' ? { estado: 'en_espera' } : {}) })
    .eq('id', ticketId)
  await registrarEvento(ticketId, perfil.nombre, `Pidió aprobación a ${aprobador.nombre || aprobador.email}`)
  await enviarEmail(
    aprobador.email,
    `[#${t.numero}] Necesitamos tu aprobación: ${t.asunto}`,
    `Hola ${aprobador.nombre || ''},\n\n${t.solicitante_nombre || t.solicitante_email} hizo un pedido que necesita tu aprobación.\n\nPodés verlo y aprobarlo o rechazarlo en ${APP_URL}/tickets/${t.id}`,
  )
  volver(ticketId)
}

export async function decidirAprobacion(ticketId: string, form: FormData) {
  const { perfil, t } = await ticketVisible(ticketId)
  const decision = String(form.get('decision') || '')
  if (t.aprobador_id === perfil.id && t.aprobacion_estado === 'pendiente' && (decision === 'aprobado' || decision === 'rechazado')) {
    const nota = String(form.get('nota') || '').trim().slice(0, 1000)
    await admin()
      .from('tickets')
      .update({ aprobacion_estado: decision, aprobacion_nota: nota, aprobacion_en: new Date().toISOString(), ...(t.estado === 'en_espera' ? { estado: 'en_curso' } : {}) })
      .eq('id', ticketId)
    await registrarEvento(ticketId, perfil.nombre, `${decision === 'aprobado' ? 'Aprobó' : 'Rechazó'} el pedido${nota ? `: ${nota}` : ''}`)
    await auditar(perfil, decision === 'aprobado' ? 'Aprobó pedido' : 'Rechazó pedido', 'ticket', `#${t.numero}`, nota)
  }
  volver(ticketId)
}

// ---------- Vínculos y fusión ----------

async function porNumero(texto: FormDataEntryValue | null) {
  const n = Number(String(texto || '').replace(/\D/g, ''))
  if (!n) return null
  // Se busca con la sesión del usuario: no se puede vincular a un ticket que no se ve.
  const { db } = await sesion()
  const { data } = await db.from('tickets').select('*').eq('numero', n).maybeSingle()
  return (data as Ticket | null) ?? null
}

export async function vincular(ticketId: string, form: FormData) {
  const { perfil, t } = await ticketStaff(ticketId)
  const padre = await porNumero(form.get('numero'))
  // El principal no puede ser el mismo ticket ni uno que ya dependa de este.
  if (padre && padre.id !== t.id && padre.padre_id !== t.id) {
    await admin().from('tickets').update({ padre_id: padre.id }).eq('id', ticketId)
    await registrarEvento(ticketId, perfil.nombre, `Vinculado al ticket principal #${padre.numero}`)
    await registrarEvento(padre.id, perfil.nombre, `Se le vinculó el ticket #${t.numero}`)
  }
  volver(ticketId)
}

export async function desvincular(ticketId: string) {
  const { perfil } = await ticketStaff(ticketId)
  await admin().from('tickets').update({ padre_id: null }).eq('id', ticketId)
  await registrarEvento(ticketId, perfil.nombre, 'Desvinculado del ticket principal')
  volver(ticketId)
}

/** Fusiona este ticket dentro de otro: pasa la conversación y los adjuntos, y este queda cerrado. */
export async function fusionar(ticketId: string, form: FormData) {
  const { perfil, t } = await ticketStaff(ticketId)
  const destino = await porNumero(form.get('numero'))
  if (!destino || destino.id === t.id || destino.fusionado_en_id || t.fusionado_en_id) volver(ticketId)

  const db = admin()
  const { data: nota } = await db
    .from('mensajes')
    .insert({
      ticket_id: destino.id,
      autor_id: perfil.id,
      autor_nombre: t.solicitante_nombre || t.solicitante_email || 'Solicitante',
      de_staff: true,
      interno: true,
      cuerpo: `Fusionado desde #${t.numero} (${t.asunto}):\n\n${t.descripcion}`.slice(0, 20000),
    })
    .select('id')
    .single()
  await db.from('adjuntos').update({ ticket_id: destino.id, mensaje_id: nota?.id ?? null }).eq('ticket_id', t.id).is('mensaje_id', null)
  await db.from('adjuntos').update({ ticket_id: destino.id }).eq('ticket_id', t.id)
  await db.from('mensajes').update({ ticket_id: destino.id }).eq('ticket_id', t.id)
  await db.from('tickets').update({ padre_id: destino.id }).eq('padre_id', t.id)
  await db.from('tickets').update({ estado: 'cerrado', fusionado_en_id: destino.id, padre_id: null }).eq('id', t.id)

  await registrarEvento(t.id, perfil.nombre, `Fusionado en #${destino.numero}`)
  await registrarEvento(destino.id, perfil.nombre, `Recibió la fusión de #${t.numero}`)
  await auditar(perfil, 'Fusionó tickets', 'ticket', `#${t.numero}`, `En #${destino.numero}`)
  revalidatePath(`/tickets/${destino.id}`)
  redirect(`/tickets/${destino.id}`)
}

// ---------- IA: resumen y borrador ----------

async function hilo(t: Ticket): Promise<Hilo> {
  const { data } = await admin().from('mensajes').select('*').eq('ticket_id', t.id).order('creado_en')
  return {
    asunto: t.asunto,
    descripcion: [t.descripcion, ...(t.datos ?? []).map((d) => `${d.etiqueta}: ${d.valor}`)].join('\n'),
    solicitante: t.solicitante_nombre || t.solicitante_email,
    mensajes: ((data ?? []) as Mensaje[]).map((m) => ({ autor: m.autor_nombre, deStaff: m.de_staff, interno: m.interno, cuerpo: m.cuerpo })),
  }
}

export async function generarResumen(ticketId: string) {
  const { t } = await ticketStaff(ticketId)
  const texto = await resumir(await hilo(t))
  if (texto) await admin().from('tickets').update({ resumen: texto.slice(0, 2000), resumen_en: new Date().toISOString() }).eq('id', ticketId)
  volver(ticketId)
}

/** La llama el formulario de respuesta. Devuelve texto para revisar: nunca se envía solo. */
export async function borradorIA(ticketId: string): Promise<{ texto?: string; error?: string }> {
  const { perfil, db, t } = await ticketStaff(ticketId)
  // Artículos que este agente puede ver y que comparten palabras con el ticket.
  const { data: arts } = await db.from('articulos').select('titulo,contenido').eq('publicado', true).limit(300)
  const mias = claves(`${t.asunto} ${t.descripcion}`)
  const utiles = (arts ?? [])
    .map((a) => ({ ...a, puntos: coincidencias(mias, claves(String(a.titulo))) * 3 + coincidencias(mias, claves(String(a.contenido))) }))
    .filter((a) => a.puntos >= 3)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 3)

  const texto = await redactarBorrador(await hilo(t), utiles, perfil.nombre || 'Mesa de Ayuda')
  return texto ? { texto } : { error: 'No se pudo generar el borrador. Revisá que la clave de IA esté configurada.' }
}
