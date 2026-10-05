import { NextResponse, type NextRequest } from 'next/server'
import { admin } from '@/lib/supabase/admin'
import { avisarTeams } from '@/lib/avisos'
import { APP_URL, slaRespuesta, slaResolucion } from '@/lib/formato'
import { etiquetaPrioridad, type Ticket } from '@/lib/tipos'

// Minutos de anticipación con los que se avisa que un SLA está por vencer.
const ANTICIPO = 30

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const db = admin()
  const limite = new Date(Date.now() + ANTICIPO * 60000).toISOString()

  const [resp, resol] = await Promise.all([
    db.from('tickets').select('*').in('estado', ['abierto', 'en_curso']).is('primera_respuesta_en', null).eq('alerta_respuesta', false).lt('vence_respuesta', limite).limit(50),
    db.from('tickets').select('*').in('estado', ['abierto', 'en_curso']).eq('alerta_resolucion', false).lt('vence_resolucion', limite).limit(50),
  ])

  const { data: sectores } = await db.from('sectores').select('id,nombre')
  const sector = new Map((sectores ?? []).map((s) => [s.id, s.nombre]))
  let enviados = 0

  async function avisar(t: Ticket, tipo: 'respuesta' | 'resolucion') {
    const sla = tipo === 'respuesta' ? slaRespuesta(t) : slaResolucion(t)
    const ok = await avisarTeams(
      `SLA de ${tipo === 'respuesta' ? 'primera respuesta' : 'resolución'} · #${t.numero} ${t.asunto}`,
      [`${sla.texto} · Prioridad ${etiquetaPrioridad(t.prioridad)} · ${t.sector_id ? sector.get(t.sector_id) : 'Triage'}`],
      `${APP_URL}/tickets/${t.id}`,
    )
    // Solo se marca como avisado si el aviso salió; si no, se reintenta en la próxima corrida.
    if (ok) {
      await db.from('tickets').update({ [tipo === 'respuesta' ? 'alerta_respuesta' : 'alerta_resolucion']: true }).eq('id', t.id)
      enviados++
    }
  }

  for (const t of (resp.data ?? []) as Ticket[]) await avisar(t, 'respuesta')
  for (const t of (resol.data ?? []) as Ticket[]) await avisar(t, 'resolucion')

  return NextResponse.json({ revisados: (resp.data?.length ?? 0) + (resol.data?.length ?? 0), enviados })
}
