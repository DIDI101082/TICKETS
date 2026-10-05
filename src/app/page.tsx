import { redirect } from 'next/navigation'
import { sesion } from '@/lib/auth'

export default async function Inicio() {
  const { staff } = await sesion()
  redirect(staff ? '/agente' : '/portal')
}
