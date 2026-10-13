import type { NextRequest } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'
import { admin } from '@/lib/supabase/admin'
import { comoCsv } from '@/lib/csv'
import { fecha } from '@/lib/formato'
import { estadoPolitica, type Politica } from '@/lib/politicas'

// Evidencia de aceptación de una política: todas las personas que tienen que aceptarla, con fecha y versión.
// Incluye también las aceptaciones de versiones anteriores, para mostrar la historia en una auditoría.
export async function GET(request: NextRequest) {
  const db = await crearCliente()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })
  const { data: yo } = await db.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (yo?.rol !== 'admin') return new Response('No autorizado', { status: 403 })

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const { data } = await admin().from('politicas').select('*').eq('id', id).maybeSingle()
  const p = data as Politica | null
  if (!p) return new Response('No existe', { status: 404 })
  const { personas } = await estadoPolitica(p)
  const { data: historia } = await admin().from('politica_aceptaciones').select('perfil_id,version,aceptada_en').eq('politica_id', p.id).neq('version', p.version)
  const anteriores = new Map<string, string[]>()
  for (const h of historia ?? []) anteriores.set(h.perfil_id, [...(anteriores.get(h.perfil_id) ?? []), `v${h.version} (${fecha(h.aceptada_en)})`])

  return comoCsv(
    ['Política', 'Versión vigente', 'Persona', 'Email', 'Organización', 'Aceptó la versión vigente', 'Fecha de aceptación', 'Versiones anteriores aceptadas'],
    personas.map((x) => [p.titulo, p.version, x.nombre, x.email, x.organizacion, x.aceptada_en ? 'Sí' : 'No', x.aceptada_en ? fecha(x.aceptada_en) : '', (anteriores.get(x.id) ?? []).join(', ')]),
    `politica-${p.titulo.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').slice(0, 40)}`,
  )
}
