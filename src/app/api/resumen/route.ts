import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { admin } from '@/lib/supabase/admin'

/**
 * Contadores para mostrar en otra aplicación (por ejemplo Accusys Cyber).
 * GET /api/resumen   cabecera  x-api-key: <RESUMEN_API_KEY>
 * Solo devuelve cantidades; nunca asuntos ni datos de personas.
 */
export async function GET(request: NextRequest) {
  const esperado = process.env.RESUMEN_API_KEY
  const recibido = request.headers.get('x-api-key') ?? ''
  const a = Buffer.from(esperado ?? '')
  const b = Buffer.from(recibido)
  if (!esperado || esperado.length < 12 || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const db = admin()
  const [{ data: tickets }, { data: sectores }] = await Promise.all([
    db.from('tickets').select('estado,sector_id,creado_en,vence_resolucion,vence_respuesta,primera_respuesta_en,asignado_id').in('estado', ['abierto', 'en_curso', 'en_espera']).limit(10000),
    db.from('sectores').select('id,nombre').order('orden'),
  ])
  const lista = tickets ?? []
  const ahora = Date.now()
  const ms = (d: string | null) => (d ? new Date(d).getTime() : Infinity)
  const vencido = (t: (typeof lista)[number]) =>
    (t.estado !== 'en_espera' && ms(t.vence_resolucion) < ahora) || (!t.primera_respuesta_en && ms(t.vence_respuesta) < ahora)
  const masAntiguo = lista.reduce((m, t) => Math.min(m, ms(t.creado_en)), Infinity)

  return NextResponse.json({
    generado: new Date().toISOString(),
    abiertos: lista.filter((t) => t.estado === 'abierto').length,
    en_curso: lista.filter((t) => t.estado === 'en_curso').length,
    en_espera: lista.filter((t) => t.estado === 'en_espera').length,
    sin_asignar: lista.filter((t) => !t.asignado_id).length,
    en_triage: lista.filter((t) => !t.sector_id).length,
    sla_vencido: lista.filter(vencido).length,
    horas_del_mas_antiguo: Number.isFinite(masAntiguo) ? Math.round((ahora - masAntiguo) / 3600000) : 0,
    por_sector: (sectores ?? []).map((s) => ({ sector: s.nombre, activos: lista.filter((t) => t.sector_id === s.id).length })),
  })
}
