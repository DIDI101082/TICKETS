import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { crearCliente } from './supabase/server'
import type { Perfil } from './tipos'

export const COOKIE_VISTA = 'ver_como_usuario'

export async function sesion() {
  const db = await crearCliente()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await db.from('perfiles').select('*').eq('id', user.id).maybeSingle()
  if (!data) redirect('/login?error=perfil')
  const perfil = data as Perfil
  if (perfil.activo === false) redirect('/login?error=inactiva')

  // "Ver como usuario": quien atiende puede mirar el portal como lo ve una persona común.
  // Es solo una vista: los permisos reales sobre los datos no cambian.
  const esStaff = perfil.rol !== 'usuario'
  const vistaPrevia = esStaff && (await cookies()).get(COOKIE_VISTA)?.value === '1'
  const esAdmin = perfil.rol === 'admin' && !vistaPrevia

  return {
    db,
    perfil,
    staff: esStaff && !vistaPrevia,
    esAdmin,
    supervisor: esAdmin || (esStaff && !vistaPrevia && !!perfil.supervisor),
    vistaPrevia,
  }
}

export async function exigirStaff() {
  const s = await sesion()
  if (!s.staff) redirect('/portal')
  return s
}

export async function exigirSupervisor() {
  const s = await sesion()
  if (!s.supervisor) redirect(s.staff ? '/agente' : '/portal')
  return s
}

export async function exigirAdmin() {
  const s = await sesion()
  if (!s.esAdmin) redirect('/')
  return s
}
