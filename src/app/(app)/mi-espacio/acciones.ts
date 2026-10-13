'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sesion } from '@/lib/auth'
import { pedirRevocacion } from '@/lib/accesos'
import type { Acceso } from '@/lib/tipos'

/** La persona avisa que ya no necesita uno de SUS accesos: se abre el ticket para quitarlo. */
export async function yaNoLoNecesito(accesoId: string) {
  const { db, perfil } = await sesion()
  // Se lee con la sesión de la persona: solo ve los accesos que son suyos
  const { data } = await db.from('accesos').select('*').eq('id', accesoId).eq('persona_id', perfil.id).maybeSingle()
  const a = data as Acceso | null
  if (a && a.estado === 'vigente') await pedirRevocacion(a, `${perfil.nombre || perfil.email} indicó que ya no lo necesita`, perfil)
  revalidatePath('/mi-espacio')
  redirect('/mi-espacio?ok=acceso')
}
