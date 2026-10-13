// Cálculo de horarios libres para los turnos con el CAU. Sin acceso a datos: se puede probar aislado.

export interface Lugar {
  id: string
  nombre: string
  modalidad: 'presencial' | 'remoto'
  indicaciones: string
  dias: number[]
  desde: string // 'HH:MM' o 'HH:MM:SS'
  hasta: string
  duracion_min: number
  capacidad: number
  anticipacion_horas: number
  sector_id: string | null
  activo: boolean
  orden: number
}

export interface Bloqueo {
  id: string
  lugar_id: string | null
  desde: string // 'YYYY-MM-DD'
  hasta: string
  motivo: string
}

export interface Ocupado {
  lugar_id: string
  inicio: string
  fin: string
}

export interface Dia {
  fecha: string // 'YYYY-MM-DD' en la zona de la empresa
  horarios: { inicio: string; hora: string; libres: number }[]
  bloqueo?: string
}

export const ZONA = 'America/Argentina/Buenos_Aires'

/** Diferencia (minutos) entre la hora local de la zona y UTC en ese momento. */
function desfase(instante: number, zona: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(instante))
      .map((x) => [x.type, x.value]),
  )
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return Math.round((local - Math.floor(instante / 60000) * 60000) / 60000)
}

/** 'YYYY-MM-DD' + 'HH:MM' en la zona indicada → instante. */
export function enZona(fecha: string, hora: string, zona = ZONA) {
  const [y, m, d] = fecha.split('-').map(Number)
  const [hh, mm] = hora.split(':').map(Number)
  const supuesto = Date.UTC(y, m - 1, d, hh, mm)
  return new Date(supuesto - desfase(supuesto, zona) * 60000)
}

/** Fecha 'YYYY-MM-DD' de un instante en la zona. */
export function fechaEnZona(instante: Date | number, zona = ZONA) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instante))
}

export function horaEnZona(instante: Date | string | number, zona = ZONA) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instante))
}

export function sumarDias(fecha: string, n: number) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const diaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay()
const minutos = (h: string) => {
  const [a, b] = h.split(':').map(Number)
  return a * 60 + (b || 0)
}

/** Horarios de un lugar para los próximos días hábiles, con cuántos lugares libres quedan en cada uno. */
export function horariosDe(lugar: Lugar, op: { ocupados: Ocupado[]; bloqueos: Bloqueo[]; ahora?: number; dias?: number; zona?: string }): Dia[] {
  const zona = op.zona ?? ZONA
  const ahora = op.ahora ?? Date.now()
  const minimo = ahora + lugar.anticipacion_horas * 3600000
  const hoy = fechaEnZona(ahora, zona)
  const salida: Dia[] = []
  const ocupados = op.ocupados.filter((o) => o.lugar_id === lugar.id).map((o) => [new Date(o.inicio).getTime(), new Date(o.fin).getTime()] as const)
  for (let i = 0; i < 31 && salida.length < (op.dias ?? 10); i++) {
    const fecha = sumarDias(hoy, i)
    if (!lugar.dias.includes(diaSemana(fecha))) continue
    const bloqueo = op.bloqueos.find((b) => (b.lugar_id == null || b.lugar_id === lugar.id) && b.desde <= fecha && b.hasta >= fecha)
    if (bloqueo) {
      salida.push({ fecha, horarios: [], bloqueo: bloqueo.motivo || 'Sin atención' })
      continue
    }
    const horarios: Dia['horarios'] = []
    for (let m = minutos(lugar.desde); m + lugar.duracion_min <= minutos(lugar.hasta); m += lugar.duracion_min) {
      const hora = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      const inicio = enZona(fecha, hora, zona).getTime()
      if (inicio < minimo) continue
      const fin = inicio + lugar.duracion_min * 60000
      const usados = ocupados.filter(([a, b]) => a < fin && b > inicio).length
      horarios.push({ inicio: new Date(inicio).toISOString(), hora, libres: Math.max(0, lugar.capacidad - usados) })
    }
    if (horarios.length) salida.push({ fecha, horarios })
  }
  return salida
}

/** Evento de calendario (.ics) para agregar el turno a Outlook. */
export function ics(t: { id: string; inicio: string; fin: string; titulo: string; lugar: string; descripcion: string }) {
  const f = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Accusys Desk//Turnos//ES', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:turno-${t.id}@accusys-desk`,
    `DTSTAMP:${f(new Date().toISOString())}`,
    `DTSTART:${f(t.inicio)}`,
    `DTEND:${f(t.fin)}`,
    `SUMMARY:${esc(t.titulo)}`,
    `LOCATION:${esc(t.lugar)}`,
    `DESCRIPTION:${esc(t.descripcion)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Turno con el CAU', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}
