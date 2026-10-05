'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirStaff } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'

export async function guardarArticulo(id: string | null, form: FormData) {
  const { perfil } = await exigirStaff()
  const visibilidad = String(form.get('visibilidad') || 'todos')
  const fila = {
    titulo: String(form.get('titulo') || '').trim().slice(0, 200),
    categoria: String(form.get('categoria') || '').trim().slice(0, 60) || 'General',
    contenido: String(form.get('contenido') || '').slice(0, 50000),
    visibilidad: ['todos', 'internos', 'staff'].includes(visibilidad) ? visibilidad : 'todos',
    publicado: form.get('publicado') === 'on',
    actualizado_en: new Date().toISOString(),
  }
  if (!fila.titulo) redirect(id ? `/kb/editar/${id}` : '/kb/editar/nuevo')

  const db = admin()
  let destino = id
  if (id) {
    const { error } = await db.from('articulos').update(fila).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await db.from('articulos').insert({ ...fila, autor_nombre: perfil.nombre }).select('id').single()
    if (error || !data) throw new Error(error?.message)
    destino = data.id
  }
  revalidatePath('/kb')
  redirect(`/kb/${destino}`)
}

export async function eliminarArticulo(id: string) {
  await exigirStaff()
  await admin().from('articulos').delete().eq('id', id)
  revalidatePath('/kb')
  redirect('/kb')
}
