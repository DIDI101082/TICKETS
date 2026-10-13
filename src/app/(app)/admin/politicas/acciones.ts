'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirAdmin } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'
import { enviarEmail } from '@/lib/avisos'
import { APP_URL } from '@/lib/formato'
import { estadoPolitica, type Politica } from '@/lib/politicas'

const texto = (v: FormDataEntryValue | null, max: number) => String(v || '').trim().slice(0, max)

export async function guardarPolitica(id: string | null, form: FormData) {
  const { perfil } = await exigirAdmin()
  const db = admin()
  const enlace = texto(form.get('enlace'), 500)
  const fila = {
    titulo: texto(form.get('titulo'), 150),
    version: texto(form.get('version'), 20) || '1.0',
    resumen: texto(form.get('resumen'), 600),
    contenido: texto(form.get('contenido'), 60000),
    enlace: /^https:\/\//i.test(enlace) ? enlace : null,
    obligatoria: form.get('obligatoria') === 'on',
    alcance: form.get('alcance') === 'todos' ? 'todos' : 'internos',
    publicada: form.get('publicada') === 'on',
    actualizada_en: new Date().toISOString(),
  }
  if (!fila.titulo) redirect('/admin/politicas?error=titulo')
  const { data: antes } = id ? await db.from('politicas').select('*').eq('id', id).maybeSingle() : { data: null }
  const previa = antes as Politica | null
  // La fecha de vigencia se renueva al publicar por primera vez o al publicar una versión nueva.
  const nuevaVigencia = fila.publicada && (!previa?.publicada || previa.version !== fila.version)
  const datos = { ...fila, ...(nuevaVigencia ? { publicada_en: new Date().toISOString() } : {}) }
  const { data, error } = id
    ? await db.from('politicas').update(datos).eq('id', id).select('id').single()
    : await db.from('politicas').insert(datos).select('id').single()
  if (error || !data) throw new Error(`No se pudo guardar la política: ${error?.message}`)
  const cambio = previa && previa.version !== fila.version ? ` (versión ${previa.version} → ${fila.version}: hay que aceptarla de nuevo)` : ''
  await auditar(perfil, id ? 'Modificó política' : 'Creó política', 'politica', `${fila.titulo} v${fila.version}${cambio}${nuevaVigencia ? ' · publicada' : ''}`)
  revalidatePath('/admin/politicas')
  revalidatePath('/politicas')
  redirect(`/admin/politicas/${data.id}?ok=1`)
}

/** Manda un mail a quienes todavía no aceptaron la versión vigente. */
export async function avisarFaltantes(id: string) {
  const { perfil } = await exigirAdmin()
  const { data } = await admin().from('politicas').select('*').eq('id', id).maybeSingle()
  const p = data as Politica | null
  if (!p?.publicada) redirect(`/admin/politicas/${id}`)
  const { personas } = await estadoPolitica(p)
  const faltan = personas.filter((x) => !x.aceptada_en && x.email.includes('@')).slice(0, 500)
  let enviados = 0
  for (const x of faltan) {
    const ok = await enviarEmail(
      x.email,
      `Política para leer y aceptar: ${p.titulo}`,
      `Hola ${(x.nombre || '').split(' ')[0]},\n\nTenés pendiente leer y aceptar la política "${p.titulo}" (versión ${p.version}). Te lleva unos minutos.\n\n${APP_URL}/politicas/${p.id}`,
    )
    if (ok) enviados++
  }
  await auditar(perfil, 'Avisó política pendiente', 'politica', `${p.titulo} v${p.version}: ${enviados} mails`)
  redirect(`/admin/politicas/${id}?avisados=${enviados}`)
}
