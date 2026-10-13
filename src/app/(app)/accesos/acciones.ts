'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirStaff } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'
import { registrarEvento } from '@/lib/tickets'
import { pedirRevocacion, registrarRecertificacion } from '@/lib/accesos'
import { desdeInputFecha, fecha } from '@/lib/formato'
import type { Acceso } from '@/lib/tipos'

async function leer(id: string) {
  const s = await exigirStaff()
  const { data } = await s.db.from('accesos').select('*').eq('id', id).maybeSingle()
  if (!data) redirect('/accesos')
  return { ...s, a: data as Acceso }
}

function volver(destino?: string): never {
  revalidatePath('/accesos')
  redirect(destino || '/accesos')
}

const destinoSeguro = (v: FormDataEntryValue | null) => {
  const d = String(v || '')
  return d.startsWith('/') && !d.startsWith('//') ? d : undefined
}

/** Cambiar la fecha de fin (extender, acortar o dejarlo sin fecha). Solo administradores y supervisores. */
export async function cambiarVencimiento(id: string, form: FormData) {
  const { perfil, supervisor, a } = await leer(id)
  const destino = destinoSeguro(form.get('volver'))
  if (!supervisor || a.estado !== 'vigente') volver(destino)
  const sinFecha = form.get('sin_fecha') === 'on'
  const hasta = sinFecha ? null : desdeInputFecha(String(form.get('hasta') || ''))
  if (!sinFecha && !hasta) volver(destino)
  await admin().from('accesos').update({ hasta, fecha_estimada: false, aviso_enviado_en: null }).eq('id', id)
  const detalle = hasta ? `vence ${fecha(hasta)}` : 'sin fecha de fin'
  await auditar(perfil, 'Cambió vencimiento de acceso', 'acceso', a.sistema, `${a.persona_nombre || a.persona_email}: ${a.hasta ? fecha(a.hasta) : 'sin fecha'} → ${detalle}`)
  if (a.ticket_id) await registrarEvento(a.ticket_id, perfil.nombre, `Acceso: ahora ${detalle}`)
  volver(destino)
}

/** Quitar el acceso ya: abre el ticket de revocación. */
export async function quitarAhora(id: string, form: FormData) {
  const { perfil, a } = await leer(id)
  const motivo = String(form.get('motivo') || '').trim().slice(0, 200)
  if (a.estado === 'vigente') await pedirRevocacion(a, motivo ? `pedido por ${perfil.nombre || perfil.email}: ${motivo}` : `pedido por ${perfil.nombre || perfil.email}`, perfil)
  volver(destinoSeguro(form.get('volver')))
}

/** Confirmar desde la app que un acceso sin fecha de fin sigue haciendo falta. */
export async function reconfirmar(id: string, form: FormData) {
  const { perfil, supervisor, a } = await leer(id)
  if (supervisor && a.estado === 'vigente') await registrarRecertificacion(a, true, perfil, String(form.get('nota') || '').trim())
  volver(destinoSeguro(form.get('volver')))
}
