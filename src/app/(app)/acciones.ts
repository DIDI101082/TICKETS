'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { COOKIE_VISTA, exigirStaff, sesion } from '@/lib/auth'
import { registrarEvento } from '@/lib/tickets'
import { avisarPersona } from '@/lib/notificar'
import { ESTADOS, PRIORIDADES, etiquetaEstado, etiquetaPrioridad, type Ticket } from '@/lib/tipos'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'

// ---------- Notificaciones ----------

export async function marcarLeidas() {
  const { perfil } = await sesion()
  await admin().from('notificaciones').update({ leida: true }).eq('perfil_id', perfil.id).eq('leida', false)
  revalidatePath('/', 'layout')
}

// ---------- Mi cuenta ----------

export async function guardarCuenta(form: FormData) {
  const { perfil } = await sesion()
  const avisos = String(form.get('avisos_mail') || 'todo')
  const nombre = String(form.get('nombre') || '').trim().slice(0, 80)
  await admin()
    .from('perfiles')
    .update({
      avisos_mail: ['todo', 'resuelto', 'nada'].includes(avisos) ? avisos : 'todo',
      ...(nombre ? { nombre } : {}),
      // Solo quien atiende tickets puede marcarse ausente: mientras dure, no recibe asignaciones automáticas.
      ...(perfil.rol !== 'usuario' ? { ausente_hasta: /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('ausente_hasta'))) ? String(form.get('ausente_hasta')) : null } : {}),
    })
    .eq('id', perfil.id)
  revalidatePath('/', 'layout')
  redirect('/cuenta?ok=1')
}

// ---------- Artículos: ¿te sirvió? ----------

export async function votarArticulo(articuloId: string, util: boolean) {
  const { db, perfil } = await sesion()
  // Solo se puede votar un artículo que la persona puede ver.
  const { data } = await db.from('articulos').select('id').eq('id', articuloId).maybeSingle()
  if (data) await admin().from('articulo_votos').upsert({ articulo_id: articuloId, perfil_id: perfil.id, util })
  revalidatePath(`/kb/${articuloId}`)
}

// ---------- Estado de servicios ----------

export async function guardarServicio(id: string | null, form: FormData) {
  const { perfil } = await exigirStaff()
  const estado = String(form.get('estado') || 'operativo')
  const fila = {
    nombre: String(form.get('nombre') || '').trim().slice(0, 80),
    estado: ['operativo', 'degradado', 'caido'].includes(estado) ? estado : 'operativo',
    mensaje: String(form.get('mensaje') || '').trim().slice(0, 500),
    orden: Math.max(0, Math.round(Number(form.get('orden')) || 0)),
    actualizado_en: new Date().toISOString(),
  }
  if (!fila.nombre) return
  const db = admin()
  const { error } = id ? await db.from('servicios').update(fila).eq('id', id) : await db.from('servicios').insert(fila)
  if (error) throw new Error(`No se pudo guardar el servicio: ${error.message}`)
  await auditar(perfil, 'Cambió estado de servicio', 'servicio', fila.nombre, `${fila.estado}${fila.mensaje ? `: ${fila.mensaje}` : ''}`)
  revalidatePath('/estado')
}

export async function eliminarServicio(id: string) {
  await exigirStaff()
  await admin().from('servicios').delete().eq('id', id)
  revalidatePath('/estado')
}

// ---------- Ver como usuario ----------

export async function alternarVista() {
  const { perfil } = await sesion()
  if (perfil.rol === 'usuario') redirect('/portal')
  const almacen = await cookies()
  const activa = almacen.get(COOKIE_VISTA)?.value === '1'
  if (activa) almacen.delete(COOKIE_VISTA)
  else almacen.set(COOKIE_VISTA, '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 4 })
  redirect(activa ? '/agente' : '/portal')
}

// ---------- Vistas guardadas de la bandeja ----------

export async function guardarVista(form: FormData) {
  const { perfil } = await exigirStaff()
  const nombre = String(form.get('nombre') || '').trim().slice(0, 40)
  const consulta = String(form.get('consulta') || '').slice(0, 500)
  if (nombre) await admin().from('vistas').insert({ perfil_id: perfil.id, nombre, consulta })
  revalidatePath('/agente')
}

export async function eliminarVista(id: string) {
  const { perfil } = await exigirStaff()
  await admin().from('vistas').delete().eq('id', id).eq('perfil_id', perfil.id)
  revalidatePath('/agente')
}

// ---------- Acciones en lote ----------

export async function accionEnLote(form: FormData) {
  const { db, perfil, esAdmin } = await exigirStaff()
  const ids = form.getAll('ids').map(String).slice(0, 200)
  const volverA = String(form.get('volver') || '/agente')
  const destino = volverA.startsWith('/agente') ? volverA : '/agente'
  if (!ids.length) redirect(destino)

  // Se releen con la sesión del agente: solo se tocan los tickets que esa persona puede ver.
  const { data } = await db.from('tickets').select('*').in('id', ids)
  const tickets = (data ?? []) as Ticket[]

  const estado = String(form.get('estado') || '')
  const prioridad = String(form.get('prioridad') || '')
  const sector = String(form.get('sector_id') || '')
  const asignado = String(form.get('asignado_id') || '')
  const cambios: Record<string, string | null> = {}
  const notas: string[] = []
  if (ESTADOS.some((e) => e.valor === estado)) {
    cambios.estado = estado
    notas.push(`Estado: ${etiquetaEstado(estado)}`)
  }
  if (PRIORIDADES.some((p) => p.valor === prioridad)) {
    cambios.prioridad = prioridad
    notas.push(`Prioridad: ${etiquetaPrioridad(prioridad)}`)
  }
  if (sector) {
    cambios.sector_id = sector === 'ninguno' ? null : sector
    notas.push('Cambio de sector')
  }
  if (asignado) {
    cambios.asignado_id = asignado === 'nadie' ? null : asignado === 'yo' ? perfil.id : asignado
    notas.push('Cambio de asignación')
  }
  const borrar = form.get('papelera') === 'on' && esAdmin
  if (!Object.keys(cambios).length && !borrar) redirect(destino)

  const svc = admin()
  for (const t of tickets) {
    if (borrar) {
      await svc.from('tickets').update({ eliminado_en: new Date().toISOString(), eliminado_por: perfil.nombre || perfil.email }).eq('id', t.id)
      continue
    }
    await svc.from('tickets').update(cambios).eq('id', t.id)
    await registrarEvento(t.id, perfil.nombre, `En lote · ${notas.join(' · ')}`)
    if (cambios.asignado_id && cambios.asignado_id !== perfil.id && cambios.asignado_id !== t.asignado_id) {
      await avisarPersona({ perfilId: cambios.asignado_id, ticket: t, tipo: 'otro', titulo: 'Te asignaron un ticket', texto: `${perfil.nombre} te asignó el pedido #${t.numero}: ${t.asunto}` })
    }
  }
  await auditar(perfil, borrar ? 'Envió tickets a la papelera' : 'Acción en lote', 'ticket', `${tickets.length} tickets`, borrar ? tickets.map((t) => `#${t.numero}`).join(', ') : notas.join(' · '))
  revalidatePath('/agente')
  redirect(destino)
}

// ---------- Presencia: quién más está mirando o respondiendo el ticket ----------

export async function latir(ticketId: string, escribiendo: boolean): Promise<{ nombre: string; escribiendo: boolean }[]> {
  const { db, perfil, staff } = await sesion()
  if (!staff) return []
  const { data: visible } = await db.from('tickets').select('id').eq('id', ticketId).maybeSingle()
  if (!visible) return []
  const svc = admin()
  await svc.from('presencia').upsert({ ticket_id: ticketId, perfil_id: perfil.id, nombre: perfil.nombre || perfil.email, escribiendo, visto_en: new Date().toISOString() })
  const { data } = await svc.from('presencia').select('perfil_id,nombre,escribiendo').eq('ticket_id', ticketId).gt('visto_en', new Date(Date.now() - 45000).toISOString())
  return (data ?? []).filter((p) => p.perfil_id !== perfil.id).map((p) => ({ nombre: p.nombre as string, escribiendo: !!p.escribiendo }))
}

// ---------- Tiempo trabajado ----------

export async function registrarTiempo(ticketId: string, form: FormData) {
  const { db, perfil } = await exigirStaff()
  const { data: visible } = await db.from('tickets').select('id').eq('id', ticketId).maybeSingle()
  const minutos = Math.round(Number(form.get('minutos')) || 0)
  if (visible && minutos > 0 && minutos <= 1440) {
    await admin().from('tiempos').insert({ ticket_id: ticketId, perfil_id: perfil.id, autor_nombre: perfil.nombre || perfil.email, minutos, nota: String(form.get('nota') || '').trim().slice(0, 200) })
  }
  revalidatePath(`/tickets/${ticketId}`)
  redirect(`/tickets/${ticketId}`)
}

// ---------- Papelera ----------

export async function enviarAPapelera(ticketId: string) {
  const { db, perfil, esAdmin } = await sesion()
  if (!esAdmin) redirect(`/tickets/${ticketId}`)
  const { data: t } = await db.from('tickets').select('numero').eq('id', ticketId).maybeSingle()
  if (t) {
    await admin().from('tickets').update({ eliminado_en: new Date().toISOString(), eliminado_por: perfil.nombre || perfil.email }).eq('id', ticketId)
    await auditar(perfil, 'Envió ticket a la papelera', 'ticket', `#${t.numero}`)
  }
  redirect('/agente')
}
