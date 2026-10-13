import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin } from './supabase/admin'
import type { Perfil } from './tipos'

// Políticas para leer y aceptar (evidencia de concientización para ISO/IEC 27001, control 6.3 y 5.10).
// Cada aceptación queda guardada con la versión: si la política cambia de versión, hay que aceptarla de nuevo.

export interface Politica {
  id: string
  titulo: string
  version: string
  resumen: string
  contenido: string
  enlace: string | null
  obligatoria: boolean
  alcance: 'internos' | 'todos'
  publicada: boolean
  publicada_en: string | null
  creada_en: string
  actualizada_en: string
}

export type PoliticaPersona = Politica & { aceptada_en: string | null; aceptoAnterior: boolean }

export const aplicaA = (p: Pick<Politica, 'alcance'>, perfil: Pick<Perfil, 'tipo'>) => p.alcance === 'todos' || perfil.tipo === 'interno'

/** Políticas publicadas que le corresponden a la persona, con su estado de aceptación (versión vigente). */
export async function politicasDe(
  db: SupabaseClient,
  perfil: Pick<Perfil, 'id' | 'tipo'>,
): Promise<{ lista: PoliticaPersona[]; pendientes: PoliticaPersona[]; error: string | null }> {
  const [{ data: ps, error }, { data: acs }] = await Promise.all([
    db.from('politicas').select('*').eq('publicada', true).order('obligatoria', { ascending: false }).order('titulo'),
    db.from('politica_aceptaciones').select('politica_id,version,aceptada_en').eq('perfil_id', perfil.id),
  ])
  if (error) return { lista: [], pendientes: [], error: error.message }
  const lista = ((ps ?? []) as Politica[])
    .filter((p) => aplicaA(p, perfil))
    .map((p) => {
      const mias = (acs ?? []).filter((a) => a.politica_id === p.id)
      const vigente = mias.find((a) => a.version === p.version)
      return { ...p, aceptada_en: (vigente?.aceptada_en as string | undefined) ?? null, aceptoAnterior: !vigente && mias.length > 0 }
    })
  return { lista, pendientes: lista.filter((p) => p.obligatoria && !p.aceptada_en), error: null }
}

/** Cantidad de políticas pendientes (para el aviso del inicio). Si la migración no corrió, devuelve 0. */
export async function cuantasPendientes(db: SupabaseClient, perfil: Pick<Perfil, 'id' | 'tipo'>) {
  const { pendientes } = await politicasDe(db, perfil)
  return pendientes.length
}

/** Quiénes tienen que aceptar una política y quiénes ya aceptaron la versión vigente. */
export async function estadoPolitica(p: Politica) {
  const db = admin()
  let q = db.from('perfiles').select('id,nombre,email,tipo,organizacion').eq('activo', true).order('nombre').limit(5000)
  if (p.alcance === 'internos') q = q.eq('tipo', 'interno')
  const [{ data: gente }, { data: acs }] = await Promise.all([
    q,
    db.from('politica_aceptaciones').select('perfil_id,aceptada_en').eq('politica_id', p.id).eq('version', p.version),
  ])
  const cuando = new Map((acs ?? []).map((a) => [a.perfil_id as string, a.aceptada_en as string]))
  const personas = (gente ?? []).map((g) => ({ id: g.id as string, nombre: g.nombre as string, email: g.email as string, organizacion: g.organizacion as string, aceptada_en: cuando.get(g.id) ?? null }))
  return { personas, aceptaron: personas.filter((x) => x.aceptada_en).length, total: personas.length }
}
