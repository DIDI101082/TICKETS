import { NextResponse, type NextRequest } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'

const VACIAS = new Set(['para', 'pero', 'como', 'cuando', 'desde', 'tengo', 'puedo', 'esta', 'este', 'esto', 'porque', 'hola', 'gracias', 'necesito', 'quiero', 'favor', 'sobre', 'tiene', 'hace', 'the', 'and'])

export async function GET(request: NextRequest) {
  const db = await crearCliente()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').toLowerCase()
  const palabras = [...new Set(q.split(/[^\p{L}\p{N}]+/u).filter((p) => p.length > 3 && !VACIAS.has(p)))].slice(0, 12)
  if (!palabras.length) return NextResponse.json([])

  // La seguridad por fila limita los artículos a los que esta persona puede ver.
  const { data } = await db.from('articulos').select('id,titulo,categoria,contenido').eq('publicado', true).limit(300)

  const puntuados = (data ?? [])
    .map((a) => {
      const titulo = String(a.titulo).toLowerCase()
      const cuerpo = String(a.contenido).toLowerCase()
      const puntos = palabras.reduce((n, p) => n + (titulo.includes(p) ? 3 : 0) + (cuerpo.includes(p) ? 1 : 0), 0)
      return { id: a.id, titulo: a.titulo, categoria: a.categoria, puntos }
    })
    .filter((a) => a.puntos >= 3)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 3)
    .map(({ id, titulo, categoria }) => ({ id, titulo, categoria }))

  return NextResponse.json(puntuados)
}
