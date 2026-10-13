'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirAdmin } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'

const num = (v: FormDataEntryValue | null, def: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || def)))
const hora = (v: FormDataEntryValue | null, def: string) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : def)

export async function guardarLugar(id: string | null, form: FormData) {
  const { perfil } = await exigirAdmin()
  const fila = {
    nombre: String(form.get('nombre') || '').trim().slice(0, 80),
    modalidad: form.get('modalidad') === 'remoto' ? 'remoto' : 'presencial',
    indicaciones: String(form.get('indicaciones') || '').trim().slice(0, 500),
    dias: form.getAll('dias').map(Number).filter((d) => d >= 0 && d <= 6),
    desde: hora(form.get('desde'), '10:00'),
    hasta: hora(form.get('hasta'), '17:00'),
    duracion_min: num(form.get('duracion_min'), 30, 10, 240),
    capacidad: num(form.get('capacidad'), 1, 1, 20),
    anticipacion_horas: num(form.get('anticipacion_horas'), 2, 0, 168),
    sector_id: String(form.get('sector_id') || '') || null,
    orden: num(form.get('orden'), 0, 0, 999),
    activo: id ? form.get('activo') === 'on' : true,
  }
  if (!fila.nombre) redirect('/admin/turnos?error=nombre')
  if (fila.hasta <= fila.desde) redirect('/admin/turnos?error=horario')
  const db = admin()
  const { error } = id ? await db.from('turno_lugares').update(fila).eq('id', id) : await db.from('turno_lugares').insert(fila)
  if (error) redirect(`/admin/turnos?error=${/unique|duplicate/i.test(error.message) ? 'repetido' : 'guardar'}`)
  await auditar(perfil, id ? 'Modificó lugar de turnos' : 'Creó lugar de turnos', 'turnos', fila.nombre, `${fila.desde}–${fila.hasta} · ${fila.duracion_min} min · cupo ${fila.capacidad}`)
  revalidatePath('/admin/turnos')
  redirect('/admin/turnos?ok=1')
}

export async function agregarBloqueo(form: FormData) {
  const { perfil } = await exigirAdmin()
  const desde = String(form.get('desde') || '')
  const hasta = String(form.get('hasta') || '') || desde
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) redirect('/admin/turnos?error=fechas')
  const fila = { desde, hasta, lugar_id: String(form.get('lugar_id') || '') || null, motivo: String(form.get('motivo') || '').trim().slice(0, 120) }
  await admin().from('turno_bloqueos').insert(fila)
  await auditar(perfil, 'Bloqueó días de turnos', 'turnos', fila.motivo || 'Sin atención', `${desde} a ${hasta}`)
  revalidatePath('/admin/turnos')
  redirect('/admin/turnos?ok=1')
}

export async function quitarBloqueo(id: string) {
  await exigirAdmin()
  await admin().from('turno_bloqueos').delete().eq('id', id)
  revalidatePath('/admin/turnos')
  redirect('/admin/turnos')
}
