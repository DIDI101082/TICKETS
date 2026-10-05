'use server'

import { revalidatePath } from 'next/cache'
import { exigirAdmin } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { PRIORIDADES } from '@/lib/tipos'

const entero = (v: FormDataEntryValue | null, min: number) => Math.max(min, Math.round(Number(v) || 0))

export async function guardarSector(id: string | null, form: FormData) {
  await exigirAdmin()
  const fila = {
    nombre: String(form.get('nombre') || '').trim().slice(0, 60),
    descripcion: String(form.get('descripcion') || '').trim().slice(0, 1000),
    orden: entero(form.get('orden'), 0),
    activo: id ? form.get('activo') === 'on' : true,
  }
  if (!fila.nombre) return
  const db = admin()
  const { error } = id ? await db.from('sectores').update(fila).eq('id', id) : await db.from('sectores').insert(fila)
  if (error) throw new Error(`No se pudo guardar el sector: ${error.message}`)
  revalidatePath('/admin')
}

export async function guardarSla(form: FormData) {
  await exigirAdmin()
  const db = admin()
  for (const p of PRIORIDADES) {
    await db
      .from('sla_politicas')
      .update({
        minutos_respuesta: entero(form.get(`resp_${p.valor}`), 1),
        minutos_resolucion: entero(form.get(`resol_${p.valor}`), 1),
      })
      .eq('prioridad', p.valor)
  }
  revalidatePath('/admin')
}

export async function guardarUsuario(id: string, form: FormData) {
  const { perfil } = await exigirAdmin()
  const rol = String(form.get('rol') || '')
  const tipo = String(form.get('tipo') || '')
  const db = admin()

  const cambios: Record<string, string> = {
    organizacion: String(form.get('organizacion') || '').trim().slice(0, 120),
  }
  if (['interno', 'externo'].includes(tipo)) cambios.tipo = tipo
  // Un admin no puede quitarse a sí mismo el rol, para no dejar el sistema sin administradores.
  if (['admin', 'agente', 'usuario'].includes(rol) && id !== perfil.id) cambios.rol = rol

  const { error } = await db.from('perfiles').update(cambios).eq('id', id)
  if (error) throw new Error(`No se pudo guardar el usuario: ${error.message}`)

  const sectores = form.getAll('sectores').map(String)
  await db.from('agente_sectores').delete().eq('perfil_id', id)
  if (sectores.length) {
    await db.from('agente_sectores').insert(sectores.map((s) => ({ perfil_id: id, sector_id: s })))
  }
  revalidatePath('/admin')
}
