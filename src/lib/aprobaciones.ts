import 'server-only'
import { randomBytes } from 'node:crypto'
import { admin } from './supabase/admin'
import { registrarEvento } from './tickets'
import { avisarInteresados, avisarPersona } from './notificar'
import { auditar } from './auditoria'
import { APP_URL } from './formato'
import type { Ticket } from './tipos'

/** Deja el ticket esperando la decisión de una persona y le avisa, con enlaces para decidir desde el mail. */
export async function solicitarAprobacion(t: Ticket, aprobador: { id: string; nombre: string; email: string }, pidio: string, siguientes: string[] = []) {
  const token = randomBytes(24).toString('base64url')
  await admin()
    .from('tickets')
    .update({
      aprobacion_estado: 'pendiente',
      aprobador_id: aprobador.id,
      aprobacion_nota: '',
      aprobacion_en: null,
      aprobacion_token: token,
      aprobadores_pendientes: siguientes,
      ...(t.estado !== 'en_espera' ? { estado: 'en_espera' } : {}),
    })
    .eq('id', t.id)
  await registrarEvento(t.id, pidio, `Pidió aprobación a ${aprobador.nombre || aprobador.email}`)
  await avisarPersona({
    perfilId: aprobador.id,
    ticket: t,
    tipo: 'aprobacion',
    titulo: 'Necesitamos tu aprobación',
    texto: `${t.solicitante_nombre || t.solicitante_email} hizo un pedido que necesita tu aprobación: ${t.asunto}\n\nPara aprobarlo o rechazarlo sin ingresar a la app, abrí este enlace:`,
    url: `${APP_URL}/aprobar/${token}`,
  })
}

/** Registra la decisión. La usan la pantalla del ticket y el enlace del mail. */
export async function registrarDecision(t: Ticket, decision: 'aprobado' | 'rechazado', nota: string, actor: { id: string; nombre: string; email: string }) {
  if (t.aprobacion_estado !== 'pendiente') return false
  const { data } = await admin()
    .from('tickets')
    .update({
      aprobacion_estado: decision,
      aprobacion_nota: nota.slice(0, 1000),
      aprobacion_en: new Date().toISOString(),
      aprobacion_token: null,
      ...(t.estado === 'en_espera' ? { estado: 'en_curso' } : {}),
    })
    .eq('id', t.id)
    .eq('aprobacion_estado', 'pendiente')
    .select('id')
  if (!data?.length) return false

  const nombre = actor.nombre || actor.email
  const hecho = decision === 'aprobado' ? 'Aprobó' : 'Rechazó'
  await registrarEvento(t.id, nombre, `${hecho} el pedido${nota ? `: ${nota}` : ''}`)
  await auditar(actor, `${hecho} pedido`, 'ticket', `#${t.numero}`, nota)

  // Aprobación en varios pasos: si quedan aprobadores en la lista, el pedido pasa al siguiente.
  const cola = t.aprobadores_pendientes ?? []
  if (decision === 'aprobado' && cola.length) {
    const { data: prox } = await admin().from('perfiles').select('id,nombre,email').eq('id', cola[0]).eq('activo', true).maybeSingle()
    if (prox) {
      await solicitarAprobacion({ ...t, estado: 'en_curso' }, prox, 'Sistema', cola.slice(1))
      return true
    }
  }
  await avisarInteresados(t, {
    tipo: 'otro',
    titulo: decision === 'aprobado' ? 'Tu pedido fue aprobado' : 'Tu pedido fue rechazado',
    texto: `${nombre} ${decision === 'aprobado' ? 'aprobó' : 'rechazó'} el pedido #${t.numero}.${nota ? `\n\nComentario: ${nota}` : ''}`,
  })
  if (t.asignado_id) {
    await avisarPersona({ perfilId: t.asignado_id, ticket: t, tipo: 'otro', titulo: `Pedido ${decision}`, texto: `${nombre} ${decision === 'aprobado' ? 'aprobó' : 'rechazó'} el pedido #${t.numero}.` })
  }
  return true
}
