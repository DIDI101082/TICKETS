import 'server-only'
import { redirect } from 'next/navigation'
import { crearCliente } from './supabase/server'
import type { Perfil } from './tipos'

export async function sesion() {
  const db = await crearCliente()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await db.from('perfiles').select('*').eq('id', user.id).maybeSingle()
  if (!data) redirect('/login?error=perfil')

  const perfil = data as Perfil
  return { db, perfil, staff: perfil.rol !== 'usuario', esAdmin: perfil.rol === 'admin' }
}

export async function exigirStaff() {
  const s = await sesion()
  if (!s.staff) redirect('/portal')
  return s
}

export async function exigirAdmin() {
  const s = await sesion()
  if (!s.esAdmin) redirect('/')
  return s
}
