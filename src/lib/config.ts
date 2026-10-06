import 'server-only'
import { admin } from './supabase/admin'
import { HORARIO_INICIAL, MANTENIMIENTO_INICIAL, OPCIONES_INICIALES, type Horario, type Mantenimiento, type Opciones } from './tipos'

export async function leerConfig<T>(clave: string, inicial: T): Promise<T> {
  const { data } = await admin().from('config').select('valor').eq('clave', clave).maybeSingle()
  return data ? { ...inicial, ...(data.valor as object) } : inicial
}

export async function guardarConfig(clave: string, valor: unknown) {
  await admin().from('config').upsert({ clave, valor })
}

export const leerHorario = () => leerConfig<Horario>('horario', HORARIO_INICIAL)
export const leerOpciones = () => leerConfig<Opciones>('opciones', OPCIONES_INICIALES)
export const leerMantenimiento = () => leerConfig<Mantenimiento>('mantenimiento', MANTENIMIENTO_INICIAL)
export const leerMails = () => leerConfig<{ firma: string; pie: string }>('mails', { firma: '', pie: '' })
export const leerReporte = () => leerConfig<{ destinatarios: string }>('reporte', { destinatarios: '' })
