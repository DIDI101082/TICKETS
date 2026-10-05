import { crearCliente } from '@/lib/supabase/server'
import { comoCsv } from '@/lib/csv'
import { fecha, slaRespuesta, slaResolucion } from '@/lib/formato'
import { etiquetaEstado, etiquetaPrioridad, type Ticket } from '@/lib/tipos'

export async function GET() {
  const db = await crearCliente()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })
  const { data: perfil } = await db.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (!perfil || perfil.rol === 'usuario') return new Response('No autorizado', { status: 403 })

  // Se lee con la sesión del usuario: exporta solo los tickets que esa persona puede ver.
  const [rt, rs, rp, ro, rc] = await Promise.all([
    db.from('tickets').select('*').order('numero', { ascending: false }).limit(10000),
    db.from('sectores').select('id,nombre'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']),
    db.from('organizaciones').select('id,nombre'),
    db.from('categorias').select('id,nombre'),
  ])
  const mapa = (l: { id: string; nombre: string }[] | null) => new Map((l ?? []).map((x) => [x.id, x.nombre]))
  const sector = mapa(rs.data)
  const org = mapa(ro.data)
  const cat = mapa(rc.data)
  const agente = new Map((rp.data ?? []).map((a) => [a.id, a.nombre || a.email]))

  const cabecera = ['Número', 'Asunto', 'Estado', 'Prioridad', 'Sector', 'Categoría', 'Organización', 'Solicitante', 'Email', 'Asignado', 'Canal', 'Equipo', 'Creado', 'Primera respuesta', 'Resuelto', 'Vence respuesta', 'Vence resolución', 'SLA respuesta', 'SLA resolución', 'Minutos en espera', 'Aprobación', 'Escalado', 'Posible incidente', 'Confidencial', 'Satisfacción', 'Comentario']
  const filas = ((rt.data ?? []) as Ticket[]).map((t) => [
    t.numero,
    t.asunto,
    etiquetaEstado(t.estado),
    etiquetaPrioridad(t.prioridad),
    t.sector_id ? sector.get(t.sector_id) : 'Triage',
    t.categoria_id ? cat.get(t.categoria_id) : '',
    t.organizacion_id ? org.get(t.organizacion_id) : '',
    t.solicitante_nombre,
    t.solicitante_email,
    t.asignado_id ? agente.get(t.asignado_id) : '',
    t.canal,
    t.equipo,
    fecha(t.creado_en),
    t.primera_respuesta_en ? fecha(t.primera_respuesta_en) : '',
    t.resuelto_en ? fecha(t.resuelto_en) : '',
    fecha(t.vence_respuesta),
    fecha(t.vence_resolucion),
    slaRespuesta(t).texto,
    slaResolucion(t).texto,
    Math.round(t.segundos_pausa / 60),
    t.aprobacion_estado === 'no_requiere' ? '' : t.aprobacion_estado,
    t.escalado_en ? 'Sí' : '',
    t.incidente ? 'Sí' : '',
    t.confidencial ? 'Sí' : '',
    t.csat_puntaje ?? '',
    t.csat_comentario,
  ])
  return comoCsv(cabecera, filas, 'tickets')
}
