import { etiquetaEstado, etiquetaPrioridad } from '@/lib/tipos'
import type { EstadoSla } from '@/lib/formato'

// Mismas "pills" que Accusys Cyber: fondo pastel y texto del mismo tono (se adaptan al modo oscuro).
const ESTADO: Record<string, string> = {
  abierto: 'bg-brand-50 text-brand-700',
  en_curso: 'bg-violet-50 text-violet-700',
  en_espera: 'bg-amber-500/10 text-amber-700',
  resuelto: 'bg-emerald-50 text-emerald-700',
  cerrado: 'bg-line/[0.05] text-ink/50',
}

const PRIORIDAD: Record<string, string> = {
  urgente: 'bg-red-50 text-red-700',
  alta: 'bg-orange-50 text-orange-700',
  media: 'bg-line/[0.05] text-ink/70',
  baja: 'bg-line/[0.05] text-ink/45',
}

const SLA: Record<string, string> = {
  ok: 'text-emerald-700',
  aviso: 'text-amber-700 font-medium',
  mal: 'text-red-700 font-medium',
  neutro: 'text-ink/45',
}

export function InsigniaEstado({ estado }: { estado: string }) {
  return <span className={`pill ${ESTADO[estado] ?? ''}`}>{etiquetaEstado(estado)}</span>
}

export function InsigniaPrioridad({ prioridad }: { prioridad: string }) {
  return <span className={`pill ${PRIORIDAD[prioridad] ?? ''}`}>{etiquetaPrioridad(prioridad)}</span>
}

export function TextoSla({ sla }: { sla: EstadoSla }) {
  return <span className={`whitespace-nowrap text-xs ${SLA[sla.tono]}`}>{sla.texto}</span>
}
