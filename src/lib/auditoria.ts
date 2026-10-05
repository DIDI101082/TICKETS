import 'server-only'
import { admin } from './supabase/admin'

/** Deja registro de quién hizo qué. Nunca interrumpe la acción principal si falla. */
export async function auditar(
  actor: { id: string; nombre: string; email: string } | null,
  accion: string,
  entidad = '',
  entidadId = '',
  detalle = '',
) {
  try {
    await admin().from('auditoria').insert({
      actor_id: actor?.id ?? null,
      actor_nombre: actor ? actor.nombre || actor.email : 'Sistema',
      accion,
      entidad,
      entidad_id: entidadId,
      detalle: detalle.slice(0, 1000),
    })
  } catch (e) {
    console.error('No se pudo registrar la auditoría:', e)
  }
}
