import type { NextRequest } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'
import { ics } from '@/lib/turnos-calc'

// Turno como evento de calendario (.ics). La seguridad por fila solo deja leer los propios (o al equipo).
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await crearCliente()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })
  const { data: t } = await db.from('turnos').select('*, turno_lugares(nombre,indicaciones)').eq('id', id).maybeSingle()
  if (!t) return new Response('No existe', { status: 404 })
  const lugar = t.turno_lugares as { nombre: string; indicaciones: string } | null
  const cuerpo = ics({
    id: t.id,
    inicio: t.inicio,
    fin: t.fin,
    titulo: `Turno con el CAU: ${t.motivo}`,
    lugar: lugar?.nombre ?? '',
    descripcion: [t.equipo ? `Equipo: ${t.equipo}` : '', lugar?.indicaciones ?? ''].filter(Boolean).join('\n'),
  })
  return new Response(cuerpo, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="turno-cau.ics"' } })
}
