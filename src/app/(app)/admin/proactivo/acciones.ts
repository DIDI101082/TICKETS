'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirAdmin } from '@/lib/auth'
import { guardarConfig } from '@/lib/config'
import { auditar } from '@/lib/auditoria'
import { leerProactivo, revisarProactivo, TIPOS, type TipoProactivo } from '@/lib/proactivo'

export async function guardarProactivo(form: FormData) {
  const { perfil } = await exigirAdmin()
  const actual = await leerProactivo()
  const num = (v: FormDataEntryValue | null, min: number, max: number, def: number) => Math.min(max, Math.max(min, Math.round(Number(v) || def)))
  const tipos = { ...actual.tipos }
  for (const t of Object.keys(TIPOS) as TipoProactivo[]) {
    tipos[t] = { activo: form.get(`activo_${t}`) === 'on', sector_id: String(form.get(`sector_${t}`) || '') || null }
  }
  const nuevo = {
    ...actual,
    activo: form.get('activo') === 'on',
    dias_sin_reporte: num(form.get('dias_sin_reporte'), 2, 60, 7),
    disco_pct: num(form.get('disco_pct'), 1, 50, 10),
    tipos,
  }
  await guardarConfig('proactivo', nuevo)
  await auditar(perfil, 'Configuró soporte proactivo', 'config', 'proactivo', nuevo.activo ? 'Activo' : 'Apagado')
  revalidatePath('/admin/proactivo')
  redirect('/admin/proactivo?ok=1')
}

export async function revisarAhora() {
  const { perfil } = await exigirAdmin()
  const r = await revisarProactivo(true)
  await auditar(perfil, 'Revisó soporte proactivo', 'config', 'proactivo', `${r.abiertos} abiertos, ${r.resueltos} resueltos`)
  revalidatePath('/admin/proactivo')
  redirect(`/admin/proactivo?abiertos=${r.abiertos}&resueltos=${r.resueltos}`)
}
