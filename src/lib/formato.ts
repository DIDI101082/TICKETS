import type { Ticket } from './tipos'

const ZONA = process.env.NEXT_PUBLIC_ZONA_HORARIA || 'America/Argentina/Buenos_Aires'

export function fecha(d?: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: ZONA }).format(new Date(d))
}

export function duracion(minutos: number) {
  const m = Math.max(0, Math.round(minutos))
  if (m < 60) return `${m} min`
  if (m < 1440) {
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h} h ${r} min` : `${h} h`
  }
  const d = Math.floor(m / 1440)
  const h = Math.round((m % 1440) / 60)
  return h ? `${d} d ${h} h` : `${d} d`
}

export function hace(d: string, ahora = Date.now()) {
  return duracion((ahora - new Date(d).getTime()) / 60000)
}

export type TonoSla = 'ok' | 'aviso' | 'mal' | 'neutro'
export interface EstadoSla {
  texto: string
  tono: TonoSla
}

function medir(vence: string | null, cumplidoEn: string | null, ahora: number, pausado: boolean): EstadoSla {
  if (!vence) return { texto: 'Sin SLA', tono: 'neutro' }
  const limite = new Date(vence).getTime()
  if (cumplidoEn) {
    return new Date(cumplidoEn).getTime() <= limite
      ? { texto: 'Cumplido', tono: 'ok' }
      : { texto: 'Incumplido', tono: 'mal' }
  }
  if (pausado) return { texto: 'En pausa', tono: 'neutro' }
  const resta = (limite - ahora) / 60000
  if (resta < 0) return { texto: `Vencido hace ${duracion(-resta)}`, tono: 'mal' }
  return { texto: `Quedan ${duracion(resta)}`, tono: resta <= 60 ? 'aviso' : 'ok' }
}

export function slaRespuesta(t: Ticket, ahora = Date.now()) {
  // Si se resolvió sin mensaje previo, la resolución cuenta como respuesta.
  return medir(t.vence_respuesta, t.primera_respuesta_en ?? t.resuelto_en, ahora, false)
}

export function slaResolucion(t: Ticket, ahora = Date.now()) {
  return medir(t.vence_resolucion, t.resuelto_en, ahora, t.estado === 'en_espera')
}

export function tamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export const APP_NOMBRE = process.env.NEXT_PUBLIC_APP_NOMBRE || 'Mesa de Ayuda'
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
