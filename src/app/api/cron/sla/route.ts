import { NextResponse, type NextRequest } from 'next/server'
import { revisar } from '@/lib/sla'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return NextResponse.json(await revisar())
}
