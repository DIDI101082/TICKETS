'use server'

import { redirect } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { archivosDe, crearTicket, subirAdjuntos } from '@/lib/tickets'

export async function crear(form: FormData) {
  const { perfil } = await sesion()
  const asunto = String(form.get('asunto') || '').trim()
  const descripcion = String(form.get('descripcion') || '').trim()
  if (!asunto || !descripcion) redirect('/portal/nuevo')

  const t = await crearTicket({
    asunto,
    descripcion,
    canal: 'portal',
    solicitanteId: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
  })
  await subirAdjuntos(t.id, null, archivosDe(form))
  redirect(`/tickets/${t.id}`)
}
