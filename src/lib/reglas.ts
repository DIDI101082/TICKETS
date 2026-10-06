import 'server-only'
import { admin } from './supabase/admin'
import type { Prioridad } from './tipos'

export interface Regla {
  id: string
  nombre: string
  activo: boolean
  orden: number
  cond: { categoria_id?: string; organizacion_id?: string; sector_id?: string; canal?: string; contiene?: string }
  acc: { prioridad?: Prioridad; sector_id?: string; asignado_id?: string; confidencial?: boolean; avisar_email?: string }
}

interface Contexto {
  categoriaId: string | null
  organizacionId: string | null
  sectorId: string | null
  canal: string
  texto: string
}

/**
 * Aplica las reglas activas, en orden. Una regla se cumple si se cumplen todas sus condiciones cargadas.
 * Si dos reglas tocan lo mismo, gana la que está más abajo en la lista.
 */
export async function aplicarReglas(c: Contexto) {
  const { data } = await admin().from('reglas').select('*').eq('activo', true).order('orden')
  const resultado: Regla['acc'] & { aplicadas: string[]; avisos: string[] } = { aplicadas: [], avisos: [] }
  let sector = c.sectorId
  const texto = c.texto.toLowerCase()

  for (const r of (data ?? []) as Regla[]) {
    const k = r.cond ?? {}
    const palabras = (k.contiene ?? '').toLowerCase().split(',').map((p) => p.trim()).filter(Boolean)
    const cumple =
      (!k.categoria_id || k.categoria_id === c.categoriaId) &&
      (!k.organizacion_id || k.organizacion_id === c.organizacionId) &&
      (!k.sector_id || k.sector_id === sector) &&
      (!k.canal || k.canal === c.canal) &&
      (!palabras.length || palabras.some((p) => texto.includes(p)))
    // Una regla sin ninguna condición no se aplica: evitaría afectar a todos los tickets por error.
    if (!cumple || (!k.categoria_id && !k.organizacion_id && !k.sector_id && !k.canal && !palabras.length)) continue

    const a = r.acc ?? {}
    if (a.prioridad) resultado.prioridad = a.prioridad
    if (a.sector_id) {
      resultado.sector_id = a.sector_id
      sector = a.sector_id
    }
    if (a.asignado_id) resultado.asignado_id = a.asignado_id
    if (a.confidencial) resultado.confidencial = true
    if (a.avisar_email) resultado.avisos.push(a.avisar_email)
    resultado.aplicadas.push(r.nombre)
  }
  return resultado
}
