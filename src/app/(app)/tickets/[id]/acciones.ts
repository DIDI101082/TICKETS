'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sesion, exigirStaff } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { archivosDe, registrarEvento, subirAdjuntos } from '@/lib/tickets'
import { enviarEmail } from '@/lib/avisos'
import { APP_URL } from '@/lib/formato'
import { ESTADOS, PRIORIDADES, etiquetaEstado, etiquetaPrioridad, type Ticket } from '@/lib/tipos'

async function ticketVisible(ticketId: string) {
  const s = await sesion()
  // Se lee con la sesión del usuario: si no tiene permiso sobre el ticket, no lo ve.
  const { data } = await s.db.from('tickets').select('*').eq('id', ticketId).maybeSingle()
  if (!data) redirect('/')
  return { ...s, t: data as Ticket }
}

export async function responder(ticketId: string, form: FormData) {
  const { perfil, staff, t } = await ticketVisible(ticketId)
  const ruta = `/tickets/${ticketId}`
  if (!staff && t.estado === 'cerrado') redirect(ruta)

  const cuerpo = String(form.get('cuerpo') || '').trim()
  const archivos = archivosDe(form)
  if (!cuerpo && !archivos.length) redirect(ruta)

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
      if (cambios.estado) {
        await registrarEvento(ticketId, perfil.nombre, `Estado: ${etiquetaEstado(t.estado)} → ${etiquetaEstado(cambios.estado)}`)
      }
      if (cambios.asignado_id) await registrarEvento(ticketId, perfil.nombre, `Tomó el ticket`)
    }

    await enviarEmail(
      t.solicitante_email,
      `[#${t.numero}] Nueva respuesta: ${t.asunto}`,
      `${perfil.nombre} respondió tu pedido:\n\n${cuerpo}\n\nPodés verlo y contestar en ${APP_URL}/tickets/${t.id} o respondiendo este mail sin cambiar el asunto.`,
    )
  }

  revalidatePath(ruta)
  redirect(ruta)
}

export async function actualizar(ticketId: string, form: FormData) {
  const { perfil } = await exigirStaff()
  const db = admin()
  const { data } = await db.from('tickets').select('*').eq('id', ticketId).maybeSingle()
  if (!data) redirect('/agente')
  const t = data as Ticket

  const estado = String(form.get('estado') || '')
  const prioridad = String(form.get('prioridad') || '')
  const sector = String(form.get('sector_id') || '') || null
  const asignado = String(form.get('asignado_id') || '') || null

  const cambios: Record<string, string | null> = {}
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

  if (Object.keys(cambios).length) {
    const { error } = await db.from('tickets').update(cambios).eq('id', ticketId)
    if (error) throw new Error(`No se pudo actualizar el ticket: ${error.message}`)
    await registrarEvento(ticketId, perfil.nombre, notas.join(' · '))
  }
  revalidatePath(`/tickets/${ticketId}`)
  redirect(`/tickets/${ticketId}`)
}

export async function tomar(ticketId: string) {
  const { perfil } = await exigirStaff()
  const db = admin()
  const { data } = await db.from('tickets').select('estado').eq('id', ticketId).maybeSingle()
  if (!data) redirect('/agente')
  await db
    .from('tickets')
    .update({ asignado_id: perfil.id, ...(data.estado === 'abierto' ? { estado: 'en_curso' } : {}) })
    .eq('id', ticketId)
  await registrarEvento(ticketId, perfil.nombre, 'Tomó el ticket')
  revalidatePath(`/tickets/${ticketId}`)
  redirect(`/tickets/${ticketId}`)
}

export async function cerrarPropio(ticketId: string) {
  const { perfil, t } = await ticketVisible(ticketId)
  if (t.solicitante_id === perfil.id && t.estado !== 'cerrado') {
    await admin().from('tickets').update({ estado: 'cerrado' }).eq('id', ticketId)
    await registrarEvento(ticketId, perfil.nombre, 'El solicitante cerró el ticket')
  }
  revalidatePath(`/tickets/${ticketId}`)
  redirect(`/tickets/${ticketId}`)
}
