import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { admin } from '@/lib/supabase/admin'
import { crearTicket, limpiarRespuesta } from '@/lib/tickets'

/**
 * Entrada de tickets desde fuera del portal (email o Teams).
 * Pensado para un flujo de Power Automate, pero sirve cualquier servicio que pueda hacer un POST.
 *
 * POST /api/entrada   cabecera  x-entrada-secret: <ENTRADA_SECRET>
 * { "canal": "email" | "teams", "de": "persona@dominio.com", "nombre": "Nombre", "asunto": "...", "cuerpo": "..." }
 *
 * Si el asunto trae [#1234] y quien escribe es el solicitante de ese ticket, se agrega como respuesta.
 */

function autorizado(request: NextRequest) {
  const esperado = process.env.ENTRADA_SECRET
  const recibido = request.headers.get('x-entrada-secret') ?? ''
  if (!esperado || esperado.length < 12) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let b: Record<string, unknown>
  try {
    b = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const crudo = texto(b.de) || texto(b.from)
  const email = (crudo.match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/)?.[0] ?? '').toLowerCase()
  const asunto = (texto(b.asunto) || texto(b.subject)).trim() || '(sin asunto)'
  const cuerpo = (texto(b.cuerpo) || texto(b.text) || texto(b.body)).trim()
  const canal = b.canal === 'teams' ? 'teams' : 'email'
  if (!email) return NextResponse.json({ error: 'Falta el remitente (de)' }, { status: 400 })

  // No generar tickets a partir de los propios avisos del sistema.
  const propia = (process.env.EMAIL_FROM ?? '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase()
  if (propia && email === propia) return NextResponse.json({ ignorado: true })

  const db = admin()
  const { data: perfil } = await db.from('perfiles').select('id,nombre').ilike('email', email).maybeSingle()
  const nombre = texto(b.nombre) || perfil?.nombre || email.split('@')[0]

  const ref = asunto.match(/\[#(\d+)\]/)
  if (ref) {
    const { data: t } = await db.from('tickets').select('id,numero,estado,solicitante_email').eq('numero', Number(ref[1])).is('eliminado_en', null).maybeSingle()
    if (t && t.solicitante_email === email && t.estado !== 'cerrado') {
      const limpio = limpiarRespuesta(cuerpo) || cuerpo
      if (limpio) {
        await db.from('mensajes').insert({
          ticket_id: t.id,
          autor_id: perfil?.id ?? null,
          autor_nombre: nombre,
          de_staff: false,
          interno: false,
          cuerpo: limpio.slice(0, 20000),
        })
      }
      return NextResponse.json({ ticket: t.numero, accion: 'respuesta' })
    }
  }

  const t = await crearTicket({
    asunto: asunto.replace(/^((re|rv|fw|fwd):\s*)+/i, ''),
    descripcion: cuerpo || '(sin texto)',
    canal,
    solicitanteId: perfil?.id ?? null,
    email,
    nombre,
  })
  return NextResponse.json({ ticket: t.numero, accion: 'creado' })
}
