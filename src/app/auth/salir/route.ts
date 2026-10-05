import { NextResponse, type NextRequest } from 'next/server'
import { crearCliente } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const db = await crearCliente()
  await db.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
