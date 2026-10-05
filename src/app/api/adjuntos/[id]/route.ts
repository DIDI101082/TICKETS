import { NextResponse, type NextRequest } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'
import { admin } from '@/lib/supabase/admin'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await crearCliente()
  // Se lee con la sesión del usuario: si no puede ver el ticket (o es de una nota interna), no aparece.
  const { data } = await db.from('adjuntos').select('ruta,nombre').eq('id', id).maybeSingle()
  if (!data) return new NextResponse('No encontrado', { status: 404 })

  const { data: firma } = await admin().storage.from('adjuntos').createSignedUrl(data.ruta, 60, { download: data.nombre })
  if (!firma) return new NextResponse('No disponible', { status: 404 })
  return NextResponse.redirect(firma.signedUrl)
}
