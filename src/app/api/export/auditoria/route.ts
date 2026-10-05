import type { NextRequest } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'
import { comoCsv } from '@/lib/csv'
import { fecha } from '@/lib/formato'

export async function GET(request: NextRequest) {
  const db = await crearCliente()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })

  // La seguridad por fila solo deja leer la auditoría a administradores.
  const sp = request.nextUrl.searchParams
  const busca = (sp.get('q') ?? '').replace(/[,()%*\\]/g, ' ').trim()
  let q = db.from('auditoria').select('*').order('creado_en', { ascending: false }).limit(20000)
  if (sp.get('vistas') !== '1') q = q.neq('accion', 'Vio ticket')
  if (busca) q = q.or(`actor_nombre.ilike.%${busca}%,accion.ilike.%${busca}%,entidad_id.ilike.%${busca}%,detalle.ilike.%${busca}%`)
  const { data } = await q

  return comoCsv(
    ['Fecha', 'Persona', 'Acción', 'Tipo', 'Sobre', 'Detalle'],
    (data ?? []).map((r) => [fecha(r.creado_en), r.actor_nombre, r.accion, r.entidad, r.entidad_id, r.detalle]),
    'auditoria',
  )
}
