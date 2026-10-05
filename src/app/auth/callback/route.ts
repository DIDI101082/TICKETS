import { NextResponse, type NextRequest } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const codigo = searchParams.get('code')
  if (codigo) {
    const db = await crearCliente()
    const { error } = await db.auth.exchangeCodeForSession(codigo)
    if (!error) return NextResponse.redirect(`${origin}/`)
  }
  return NextResponse.redirect(`${origin}/login?error=acceso`)
}
