'use server'

import { redirect } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { archivosDe, crearTicket, subirAdjuntos } from '@/lib/tickets'
import type { Categoria, Dato } from '@/lib/tipos'

export async function crear(form: FormData) {
  const { db, perfil } = await sesion()
  const asunto = String(form.get('asunto') || '').trim()
  const descripcion = String(form.get('descripcion') || '').trim()
  if (!asunto || !descripcion) redirect('/portal/nuevo')

  // Las respuestas del formulario se arman contra los campos definidos en la categoría, no contra lo que mande el navegador.
  const categoriaId = String(form.get('categoria_id') || '') || null
  let datos: Dato[] = []
  if (categoriaId) {
    const { data } = await db.from('categorias').select('*').eq('id', categoriaId).eq('activo', true).maybeSingle()
    const cat = data as Categoria | null
    if (!cat) redirect('/portal/nuevo')
    datos = (cat.campos ?? [])
      .map((c, i) => ({ etiqueta: c.etiqueta, valor: String(form.get(`campo_${i}`) || '').trim().slice(0, 2000) }))
      .filter((d) => d.valor)
  }

  const t = await crearTicket({
    asunto,
    descripcion,
    canal: 'portal',
    solicitanteId: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    categoriaId,
    datos,
  })
  await subirAdjuntos(t.id, null, archivosDe(form))
  redirect(`/tickets/${t.id}`)
}
