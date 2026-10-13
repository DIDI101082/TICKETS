'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { aplicaA, type Politica } from '@/lib/politicas'

export async function aceptarPolitica(id: string, version: string, form: FormData) {
  const { db, perfil } = await sesion()
  if (form.get('lei') !== 'on') redirect(`/politicas/${id}?error=marcar`)
  // Se lee con la sesión de la persona: solo puede aceptar lo que tiene publicado y le corresponde.
  const { data } = await db.from('politicas').select('*').eq('id', id).eq('publicada', true).maybeSingle()
  const p = data as Politica | null
  if (!p || !aplicaA(p, perfil)) redirect('/politicas')
  // Si la versión cambió mientras la leía, tiene que ver la nueva antes de aceptar.
  if (p.version !== version) redirect(`/politicas/${id}?error=version`)
  const { error } = await admin()
    .from('politica_aceptaciones')
    .upsert({ politica_id: p.id, perfil_id: perfil.id, version: p.version }, { onConflict: 'politica_id,perfil_id,version', ignoreDuplicates: true })
  if (error) throw new Error(`No se pudo registrar la aceptación: ${error.message}`)
  revalidatePath('/politicas')
  redirect(`/politicas?ok=${encodeURIComponent(p.titulo)}`)
}
