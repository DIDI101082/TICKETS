import { etiquetaEstado, etiquetaPrioridad } from '@/lib/tipos'
import type { EstadoSla } from '@/lib/formato'

const ESTADO: Record<string, string> = {
  abierto: 'bg-sky-100 text-sky-900',
  en_curso: 'bg-indigo-100 text-indigo-900',
  en_espera: 'bg-amber-100 text-amber-900',
  resuelto: 'bg-emerald-100 text-emerald-900',
  cerrado: 'bg-black/10 text-black/60',
}

const PRIORIDAD: Record<string, string> = {
  urgente: 'bg-red-600 text-white',
  alta: 'bg-orange-100 text-orange-900',
  media: 'bg-black/[0.07] text-black/70',
  baja: 'bg-black/[0.04] text-black/50',
}

const SLA: Record<string, string> = {
  ok: 'text-emerald-800',
  aviso: 'text-amber-700 font-medium',
  mal: 'text-red-700 font-medium',
  neutro: 'text-black/45',
}

export function InsigniaEstado({ estado }: { estado: string }) {
  return <span className={`insignia ${ESTADO[estado] ?? ''}`}>{etiquetaEstado(estado)}</span>
}

export function InsigniaPrioridad({ prioridad }: { prioridad: string }) {
  return <span className={`insignia ${PRIORIDAD[prioridad] ?? ''}`}>{etiquetaPrioridad(prioridad)}</span>
}

export function TextoSla({ sla }: { sla: EstadoSla }) {
  return <span className={`whitespace-nowrap text-xs ${SLA[sla.tono]}`}>{sla.texto}</span>
}
