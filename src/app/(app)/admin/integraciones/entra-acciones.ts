'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirAdmin } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { guardarConfig } from '@/lib/config'
import { leerEntra, sincronizarEntra } from '@/lib/entra'

export async function guardarEntra(form: FormData) {
  const { perfil } = await exigirAdmin()
  const conf = await leerEntra()
  const nuevo = { ...conf, activo: form.get('activo') === 'on', desactivar: form.get('desactivar') === 'on' }
  await guardarConfig('entra', nuevo)
  await auditar(perfil, 'Configuró Entra ID', 'integracion', 'entra', `automática: ${nuevo.activo ? 'sí' : 'no'} · desactivar cuentas: ${nuevo.desactivar ? 'sí' : 'no'}`)
  revalidatePath('/admin/integraciones')
  redirect('/admin/integraciones?entra=guardado#entra')
}

export async function sincronizarEntraAhora() {
  const { perfil } = await exigirAdmin()
  const r = await sincronizarEntra()
  await auditar(perfil, 'Sincronizó con Entra ID', 'integracion', 'entra', r.error ? `error: ${r.error}` : JSON.stringify(r.resultado))
  revalidatePath('/admin/integraciones')
  redirect('/admin/integraciones?entra=sincronizado#entra')
}
