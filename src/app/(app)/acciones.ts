'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirStaff, sesion } from '@/lib/auth'
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
    .update({ avisos_mail: ['todo', 'resuelto', 'nada'].includes(avisos) ? avisos : 'todo', ...(nombre ? { nombre } : {}) })
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
