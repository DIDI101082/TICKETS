'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirStaff, sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'
import { registrarEvento } from '@/lib/tickets'
import { avisarPersona } from '@/lib/notificar'
import { avisarTurno, cuando, datosAgenda, MOTIVOS, zonaTurnos, type Turno } from '@/lib/turnos'
import { horariosDe, type Lugar } from '@/lib/turnos-calc'
import type { Ticket } from '@/lib/tipos'

const ERRORES: Record<string, string> = { TURNO_OCUPADO: 'ocupado', TURNO_SUPERPUESTO: 'superpuesto', TURNO_LIMITE: 'limite' }

export async function reservarTurno(form: FormData) {
  const { db, perfil } = await sesion()
  const lugarId = String(form.get('lugar_id') || '')
  const inicio = String(form.get('inicio') || '')
  const motivo = String(form.get('motivo') || '')
  const ticketId = String(form.get('ticket_id') || '')
  if (!MOTIVOS.includes(motivo as (typeof MOTIVOS)[number])) redirect('/turnos?error=datos')

  // El horario elegido se vuelve a calcular acá: no se confía en lo que manda el navegador.
  const zona = await zonaTurnos()
  const { lugares, bloqueos, ocupados } = await datosAgenda(new Date(), new Date(Date.now() + 32 * 86400000))
  const lugar = lugares.find((l) => l.id === lugarId && l.activo)
  if (!lugar) redirect('/turnos?error=datos')
  const libre = horariosDe(lugar, { ocupados, bloqueos, zona, dias: 15 }).flatMap((d) => d.horarios).find((h) => h.inicio === inicio)
  if (!libre || libre.libres < 1) redirect('/turnos?error=ocupado')

  // Si viene de un pedido, tiene que ser uno que la persona puede ver.
  let ticket: Ticket | null = null
  if (ticketId) {
    const { data } = await db.from('tickets').select('*').eq('id', ticketId).maybeSingle()
    ticket = (data as Ticket | null) && !['cerrado'].includes((data as Ticket).estado) ? (data as Ticket) : null
  }

  const fin = new Date(new Date(inicio).getTime() + lugar.duracion_min * 60000).toISOString()
  const { data, error } = await admin()
    .from('turnos')
    .insert({
      lugar_id: lugar.id,
      inicio,
      fin,
      perfil_id: perfil.id,
      persona_nombre: perfil.nombre || perfil.email.split('@')[0],
      persona_email: perfil.email,
      motivo,
      detalle: String(form.get('detalle') || '').trim().slice(0, 1000),
      equipo: String(form.get('equipo') || '').trim().slice(0, 80) || ticket?.equipo || '',
      ticket_id: ticket?.id ?? null,
    })
    .select('*')
    .single()
  if (error || !data) redirect(`/turnos?error=${ERRORES[Object.keys(ERRORES).find((k) => error?.message.includes(k)) ?? ''] ?? 'datos'}`)
  const t = data as Turno

  if (ticket) {
    await registrarEvento(ticket.id, perfil.nombre || perfil.email, `Reservó un turno: ${cuando(t, zona)} · ${lugar.nombre}`)
    if (ticket.asignado_id) {
      await avisarPersona({ perfilId: ticket.asignado_id, ticket, tipo: 'otro', titulo: 'Reservaron un turno', texto: `${t.persona_nombre} reservó un turno para el ${cuando(t, zona)} en ${lugar.nombre}.` })
    }
  }
  await avisarTurno(t, lugar, 'confirmado')
  revalidatePath('/turnos')
  redirect(`/turnos?ok=${t.id}`)
}

export async function cancelarMiTurno(id: string) {
  const { db, perfil } = await sesion()
  const { data } = await db.from('turnos').select('*').eq('id', id).eq('perfil_id', perfil.id).maybeSingle()
  const t = data as Turno | null
  if (t && t.estado === 'reservado' && new Date(t.inicio).getTime() > Date.now()) {
    await admin().from('turnos').update({ estado: 'cancelado' }).eq('id', t.id).eq('estado', 'reservado')
    if (t.ticket_id) await registrarEvento(t.ticket_id, perfil.nombre || perfil.email, `Canceló el turno del ${cuando(t, await zonaTurnos())}`)
  }
  revalidatePath('/turnos')
  redirect('/turnos?cancelado=1')
}

// ---------- Agenda del equipo ----------

async function turnoStaff(id: string) {
  const s = await exigirStaff()
  const { data } = await admin().from('turnos').select('*, turno_lugares(nombre,indicaciones,modalidad)').eq('id', id).maybeSingle()
  if (!data) redirect('/turnos/agenda')
  return { ...s, t: data as Turno & { turno_lugares: Pick<Lugar, 'nombre' | 'indicaciones' | 'modalidad'> } }
}

const volver = (form: FormData): never => {
  const d = String(form.get('volver') || '')
  revalidatePath('/turnos/agenda')
  redirect(d.startsWith('/turnos/agenda') ? d : '/turnos/agenda')
}

export async function marcarTurno(id: string, form: FormData) {
  const { perfil, t } = await turnoStaff(id)
  const estado = String(form.get('estado') || '')
  const nota = String(form.get('nota') || '').trim().slice(0, 1000)
  const cambios: Partial<Turno> = {}
  if (['atendido', 'ausente', 'reservado'].includes(estado)) cambios.estado = estado as Turno['estado']
  if (form.get('tomar') === '1') cambios.tecnico_id = perfil.id
  if (nota) cambios.nota_tecnico = nota
  if (Object.keys(cambios).length) {
    await admin().from('turnos').update(cambios).eq('id', t.id)
    if (t.ticket_id && cambios.estado && cambios.estado !== t.estado) {
      await registrarEvento(t.ticket_id, perfil.nombre || perfil.email, `Turno ${cambios.estado === 'atendido' ? 'atendido' : cambios.estado === 'ausente' ? ': la persona no se presentó' : 'reabierto'}${nota ? ` · ${nota}` : ''}`)
    }
  }
  volver(form)
}

export async function cancelarTurnoStaff(id: string, form: FormData) {
  const { perfil, t } = await turnoStaff(id)
  const motivo = String(form.get('motivo') || '').trim().slice(0, 300)
  if (t.estado === 'reservado') {
    await admin().from('turnos').update({ estado: 'cancelado', nota_tecnico: motivo || t.nota_tecnico }).eq('id', t.id)
    await avisarTurno(t, t.turno_lugares, 'cancelado', motivo ? `Motivo: ${motivo}` : '')
    await auditar(perfil, 'Canceló turno', 'turno', t.persona_email, `${cuando(t)}${motivo ? ` · ${motivo}` : ''}`)
    if (t.ticket_id) await registrarEvento(t.ticket_id, perfil.nombre || perfil.email, `Se canceló el turno${motivo ? `: ${motivo}` : ''}`)
  }
  volver(form)
}
