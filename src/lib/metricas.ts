import type { Ticket } from './tipos'

const ms = (d: string) => new Date(d).getTime()
export const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')

export interface Fila {
  etiqueta: string
  creados: number
  resueltos: number
  slaResp: string
  slaResol: string
  tiempoResol: number | null
  csat: number | null
  encuestas: number
}

/** Indicadores de un grupo de tickets creados dentro de un período. */
export function indicadores(etiqueta: string, tickets: Ticket[]): Fila {
  const resueltos = tickets.filter((t) => t.resuelto_en)
  const conResp = tickets.filter((t) => t.primera_respuesta_en && t.vence_respuesta)
  const conResol = resueltos.filter((t) => t.vence_resolucion)
  const calificados = tickets.filter((t) => t.csat_puntaje)
  return {
    etiqueta,
    creados: tickets.length,
    resueltos: resueltos.length,
    slaResp: pct(conResp.filter((t) => ms(t.primera_respuesta_en!) <= ms(t.vence_respuesta!)).length, conResp.length),
    slaResol: pct(conResol.filter((t) => ms(t.resuelto_en!) <= ms(t.vence_resolucion!)).length, conResol.length),
    tiempoResol: promedio(resueltos.map((t) => (ms(t.resuelto_en!) - ms(t.creado_en)) / 60000 - t.segundos_pausa / 60)),
    csat: promedio(calificados.map((t) => t.csat_puntaje!)),
    encuestas: calificados.length,
  }
}
