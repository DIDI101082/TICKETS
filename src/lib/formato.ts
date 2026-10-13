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

export const APP_NOMBRE = process.env.NEXT_PUBLIC_APP_NOMBRE || 'Accusys Desk'
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

export function soloFecha(d?: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: ZONA }).format(new Date(d))
}

/** Días que faltan (negativo si ya pasó). */
export const diasHasta = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)

// Los campos de tipo fecha del formulario se guardan legibles ("20/10/2026 18:00") y se vuelven a cargar en el calendario.
export function campoFechaLegible(v: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : v
}
export function campoFechaInput(v: string) {
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!m) return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : ''
  const p = (x: string) => x.padStart(2, '0')
  return `${m[3]}-${p(m[2])}-${p(m[1])}T${p(m[4] ?? '23')}:${m[5] ?? '59'}`
}

/** Valor para un <input type="datetime-local"> a partir de una fecha guardada, en la zona de la app. */
export function aInputFecha(d?: string | null) {
  if (!d) return ''
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(d))
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? '00'
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`
}

/** Fecha y hora escritas en la zona de la app ("2026-10-20T18:00") → instante ISO. */
export function desdeInputFecha(v: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  // Se prueba el desfase de la zona en ese momento (contempla cambios de horario)
  const aprox = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  const enZona = new Date(new Date(aprox).toLocaleString('en-US', { timeZone: ZONA }))
  const enUtc = new Date(new Date(aprox).toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(aprox + (enUtc.getTime() - enZona.getTime())).toISOString()
}
