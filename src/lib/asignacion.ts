import 'server-only'
import { admin } from './supabase/admin'

const ZONA = process.env.NEXT_PUBLIC_ZONA_HORARIA || 'America/Argentina/Buenos_Aires'
export const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())

/** Agentes del sector que hoy pueden recibir tickets: activos y no ausentes. */
async function disponibles(sectorId: string) {
  const db = admin()
  const hoy = hoyLocal()
  const { data: rel } = await db.from('agente_sectores').select('perfil_id').eq('sector_id', sectorId)
  const ids = (rel ?? []).map((r) => r.perfil_id as string)
  if (!ids.length) return []
  const { data } = await db.from('perfiles').select('id,nombre,email,ausente_hasta').in('id', ids).eq('activo', true).in('rol', ['admin', 'agente']).order('nombre')
  return (data ?? []).filter((p) => !p.ausente_hasta || p.ausente_hasta < hoy)
}

/** Quien está de guardia hoy en el sector, si hay alguien. */
export async function deGuardia(sectorId: string): Promise<string | null> {
  const hoy = hoyLocal()
  const { data } = await admin().from('guardias').select('perfil_id').eq('sector_id', sectorId).lte('desde', hoy).gte('hasta', hoy).order('desde', { ascending: false }).limit(1)
  return (data?.[0]?.perfil_id as string | undefined) ?? null
}

/** A quién se le escala un ticket del sector: la guardia de hoy o, si no hay, el responsable. */
export async function responsableDe(sectorId: string | null, responsableId: string | null) {
  if (!sectorId) return responsableId
  return (await deGuardia(sectorId)) ?? responsableId
}

/**
 * Reparto automático según cómo esté configurado el sector:
 *  - manual: no asigna
 *  - turno: uno por vez, en orden
 *  - carga: al que menos tickets activos tiene
 * Si hay alguien de guardia hoy y está disponible, se lo lleva esa persona.
 */
export async function elegirAgente(sectorId: string | null): Promise<string | null> {
  if (!sectorId) return null
  const db = admin()
  const { data: sector } = await db.from('sectores').select('asignacion,ultimo_asignado').eq('id', sectorId).maybeSingle()
  if (!sector || sector.asignacion === 'manual') return null

  const agentes = await disponibles(sectorId)
  if (!agentes.length) return null

  const guardia = await deGuardia(sectorId)
  if (guardia && agentes.some((a) => a.id === guardia)) return guardia

  if (sector.asignacion === 'turno') {
    const i = agentes.findIndex((a) => a.id === sector.ultimo_asignado)
    const elegido = agentes[(i + 1) % agentes.length].id as string
    await db.from('sectores').update({ ultimo_asignado: elegido }).eq('id', sectorId)
    return elegido
  }

  const { data: activos } = await db.from('tickets').select('asignado_id').in('estado', ['abierto', 'en_curso', 'en_espera']).is('eliminado_en', null).in('asignado_id', agentes.map((a) => a.id))
  const carga = new Map<string, number>(agentes.map((a) => [a.id as string, 0]))
  for (const t of activos ?? []) carga.set(t.asignado_id, (carga.get(t.asignado_id) ?? 0) + 1)
  return [...carga.entries()].sort((a, b) => a[1] - b[1])[0][0]
}
