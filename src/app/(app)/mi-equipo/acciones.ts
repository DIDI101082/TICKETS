'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'
import { enviarEmail } from '@/lib/avisos'
import { APP_URL } from '@/lib/formato'
import { pedirRevocacion, registrarRecertificacion } from '@/lib/accesos'
import { politicasDe } from '@/lib/politicas'
import type { Acceso } from '@/lib/tipos'

/** Solo se actúa sobre accesos de personas que tienen a quien actúa como jefe directo. */
async function accesoDeMiEquipo(id: string) {
  const { perfil } = await sesion()
  const db = admin()
  const { data } = await db.from('accesos').select('*').eq('id', id).maybeSingle()
  const a = data as Acceso | null
  if (!a?.persona_id) redirect('/mi-equipo')
  const { data: p } = await db.from('perfiles').select('id').eq('id', a.persona_id).eq('jefe_id', perfil.id).maybeSingle()
  if (!p) redirect('/mi-equipo')
  return { perfil, a }
}

export async function quitarAccesoEquipo(id: string) {
  const { perfil, a } = await accesoDeMiEquipo(id)
  if (a.estado === 'vigente') await pedirRevocacion(a, `su jefe (${perfil.nombre || perfil.email}) indicó que ya no lo necesita`, perfil)
  revalidatePath('/mi-equipo')
  redirect('/mi-equipo?ok=quitar')
}

export async function sigueHaciendoFalta(id: string) {
  const { perfil, a } = await accesoDeMiEquipo(id)
  if (a.estado === 'vigente') await registrarRecertificacion(a, true, perfil, `Reconfirmado por su jefe desde Mi equipo`)
  revalidatePath('/mi-equipo')
  redirect('/mi-equipo?ok=sigue')
}

/** Recordatorio por mail a las personas del equipo que tienen políticas sin aceptar. */
export async function recordarPoliticas() {
  const { perfil } = await sesion()
  const db = admin()
  const { data: gente } = await db.from('perfiles').select('id,nombre,email,tipo').eq('jefe_id', perfil.id).eq('activo', true)
  let n = 0
  for (const g of gente ?? []) {
    const { pendientes } = await politicasDe(db, { id: g.id, tipo: g.tipo })
    if (!pendientes.length || !String(g.email).includes('@')) continue
    const ok = await enviarEmail(
      g.email,
      'Tenés políticas para leer y aceptar',
      `Hola ${(g.nombre || '').split(' ')[0]},\n\n${perfil.nombre || 'Tu jefe'} te recuerda que tenés pendiente leer y aceptar:\n${pendientes.map((p) => `- ${p.titulo}`).join('\n')}\n\nTe lleva unos minutos: ${APP_URL}/politicas`,
    )
    if (ok) n++
  }
  await auditar(perfil, 'Recordó políticas a su equipo', 'politica', perfil.email, `${n} mails`)
  redirect(`/mi-equipo?recordados=${n}`)
}
