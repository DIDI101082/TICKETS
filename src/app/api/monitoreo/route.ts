import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { admin } from '@/lib/supabase/admin'
import { crearTicket, registrarEvento } from '@/lib/tickets'

/**
 * Alertas de monitoreo (pensado para PRTG, sirve cualquier herramienta que haga un POST).
 *
 * POST /api/monitoreo?secret=<MONITOREO_SECRET>     (o cabecera x-monitoreo-secret)
 * Acepta JSON o formulario con: dispositivo, sensor, estado, mensaje
 *
 * Estado caído  -> abre un ticket en el sector MONITOREO_SECTOR (por defecto "Infraestructura").
 *                  Si ya hay uno abierto para el mismo dispositivo y sensor, agrega un mensaje.
 * Estado normal -> agrega "servicio restablecido" y marca el ticket como resuelto.
 */

function autorizado(request: NextRequest) {
  const esperado = process.env.MONITOREO_SECRET
  const recibido = request.headers.get('x-monitoreo-secret') ?? request.nextUrl.searchParams.get('secret') ?? ''
  if (!esperado || esperado.length < 12) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let b: Record<string, string> = {}
  try {
    const tipo = request.headers.get('content-type') ?? ''
    if (tipo.includes('json')) b = await request.json()
    else b = Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]))
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const dispositivo = String(b.dispositivo ?? b.device ?? '').trim().slice(0, 120)
  const sensor = String(b.sensor ?? b.name ?? '').trim().slice(0, 120)
  const estado = String(b.estado ?? b.status ?? '').toLowerCase()
  const mensaje = String(b.mensaje ?? b.message ?? '').trim().slice(0, 2000)
  if (!dispositivo && !sensor) return NextResponse.json({ error: 'Falta dispositivo o sensor' }, { status: 400 })

  const caido = /down|fallo|falla|error|ca[ií]d|cr[ií]tic/.test(estado)
  const normal = /up|ok|disponible|normal|recuper|restablec/.test(estado) && !caido
  if (!caido && !normal) return NextResponse.json({ ignorado: true, motivo: `Estado no reconocido: ${estado}` })

  const clave = `monitoreo|${dispositivo}|${sensor}`.toLowerCase()
  const db = admin()
  const { data: abierto } = await db
    .from('tickets')
    .select('id,numero')
    .eq('clave_externa', clave)
    .is('eliminado_en', null)
    .in('estado', ['abierto', 'en_curso', 'en_espera'])
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (normal) {
    if (!abierto) return NextResponse.json({ ignorado: true, motivo: 'No había ticket abierto' })
    await db.from('mensajes').insert({ ticket_id: abierto.id, autor_nombre: 'Monitoreo', de_staff: true, interno: true, cuerpo: `Servicio restablecido. ${mensaje}`.trim() })
    await db.from('tickets').update({ estado: 'resuelto' }).eq('id', abierto.id)
    await registrarEvento(abierto.id, 'Monitoreo', 'Resuelto automáticamente: el servicio volvió a la normalidad')
    return NextResponse.json({ ticket: abierto.numero, accion: 'resuelto' })
  }

  if (abierto) {
    await db.from('mensajes').insert({ ticket_id: abierto.id, autor_nombre: 'Monitoreo', de_staff: true, interno: true, cuerpo: `Sigue caído. ${mensaje}`.trim() })
    return NextResponse.json({ ticket: abierto.numero, accion: 'actualizado' })
  }

  const nombreSector = process.env.MONITOREO_SECTOR || 'Infraestructura'
  const { data: sector } = await db.from('sectores').select('id').ilike('nombre', nombreSector).maybeSingle()
  const t = await crearTicket({
    asunto: `Caída: ${[dispositivo, sensor].filter(Boolean).join(' · ')}`,
    descripcion: mensaje || 'Alerta recibida desde el monitoreo.',
    canal: 'monitoreo',
    email: '',
    nombre: 'Monitoreo',
    sectorId: sector?.id ?? null,
    prioridad: 'alta',
    sinIA: true,
    claveExterna: clave,
    avisarSolicitante: false,
    datos: [
      { etiqueta: 'Dispositivo', valor: dispositivo },
      { etiqueta: 'Sensor', valor: sensor },
    ].filter((d) => d.valor),
  })
  return NextResponse.json({ ticket: t.numero, accion: 'creado' })
}
