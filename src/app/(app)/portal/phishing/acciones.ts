'use server'

import { redirect } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { crearReportePhishing, esClic, MAX_CORREO } from '@/lib/phishing'

export async function reportarPhishing(form: FormData) {
  const { perfil } = await sesion()
  const archivo = form.get('correo')
  const correo = archivo instanceof File && archivo.size > 0 ? archivo : null
  if (correo && correo.size > MAX_CORREO) redirect('/portal/phishing?error=grande')
  const remitente = String(form.get('remitente') || '').trim().slice(0, 200)
  const asunto = String(form.get('asunto') || '').trim().slice(0, 300)
  const texto = String(form.get('texto') || '').trim().slice(0, 20000)
  if (!correo && !remitente && !texto) redirect('/portal/phishing?error=vacio')
  const clic = String(form.get('clic') || 'no')

  const { ticket } = await crearReportePhishing({
    solicitanteId: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre || perfil.email.split('@')[0],
    canal: 'portal',
    remitente,
    asunto,
    texto,
    comentario: String(form.get('comentario') || '').slice(0, 2000),
    hizoClic: esClic(clic) ? clic : 'no',
    archivo: correo,
  })
  redirect(`/portal/phishing?listo=${ticket.id}&clic=${esClic(clic) ? clic : 'no'}`)
}
