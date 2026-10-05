import { NextResponse } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'
import { fecha, slaRespuesta, slaResolucion } from '@/lib/formato'
import { etiquetaEstado, etiquetaPrioridad, type Ticket } from '@/lib/tipos'

function celda(v: unknown) {
  let s = v == null ? '' : String(v)
  // Evita que Excel interprete el contenido como fórmula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

export async function GET() {
  const db = await crearCliente()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })
  const { data: perfil } = await db.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (!perfil || perfil.rol === 'usuario') return new NextResponse('No autorizado', { status: 403 })

  const [rt, rs, rp] = await Promise.all([
    db.from('tickets').select('*').order('numero', { ascending: false }).limit(10000),
    db.from('sectores').select('id,nombre'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']),
  ])
  const sector = new Map((rs.data ?? []).map((s) => [s.id, s.nombre]))
  const agente = new Map((rp.data ?? []).map((a) => [a.id, a.nombre || a.email]))

  const cabecera = ['Número', 'Asunto', 'Estado', 'Prioridad', 'Sector', 'Solicitante', 'Email', 'Asignado', 'Canal', 'Creado', 'Primera respuesta', 'Resuelto', 'Vence respuesta', 'Vence resolución', 'SLA respuesta', 'SLA resolución', 'Minutos en espera']
  const filas = ((rt.data ?? []) as Ticket[]).map((t) =>
    [
      t.numero,
      t.asunto,
      etiquetaEstado(t.estado),
      etiquetaPrioridad(t.prioridad),
      t.sector_id ? sector.get(t.sector_id) : 'Triage',
      t.solicitante_nombre,
      t.solicitante_email,
      t.asignado_id ? agente.get(t.asignado_id) : '',
      t.canal,
      fecha(t.creado_en),
      t.primera_respuesta_en ? fecha(t.primera_respuesta_en) : '',
      t.resuelto_en ? fecha(t.resuelto_en) : '',
      fecha(t.vence_respuesta),
      fecha(t.vence_resolucion),
      slaRespuesta(t).texto,
      slaResolucion(t).texto,
      Math.round(t.segundos_pausa / 60),
    ]
      .map(celda)
      .join(';'),
  )

  // BOM + punto y coma: Excel en español lo abre directo, con acentos.
  const csv = '﻿' + [cabecera.map(celda).join(';'), ...filas].join('\r\n')
  const dia = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tickets-${dia}.csv"`,
    },
  })
}
