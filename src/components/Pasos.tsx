import type { Ticket } from '@/lib/tipos'

/** Línea de tiempo simple para el solicitante: en qué etapa está su pedido. */
export default function Pasos({ t }: { t: Ticket }) {
  const terminado = t.estado === 'resuelto' || t.estado === 'cerrado'
  const tomado = t.estado !== 'abierto' || !!t.primera_respuesta_en
  const conAprobacion = t.aprobacion_estado !== 'no_requiere'
  const aprobado = t.aprobacion_estado === 'aprobado'
  const rechazado = t.aprobacion_estado === 'rechazado'

  const pasos = [
    { nombre: 'Recibido', hecho: true },
    { nombre: 'En revisión', hecho: tomado },
    ...(conAprobacion ? [{ nombre: rechazado ? 'Rechazado' : aprobado ? 'Aprobado' : 'Esperando aprobación', hecho: aprobado || rechazado }] : []),
    { nombre: 'En curso', hecho: terminado || (tomado && (!conAprobacion || aprobado)) },
    { nombre: t.estado === 'cerrado' ? 'Cerrado' : 'Resuelto', hecho: terminado },
  ]
  // El paso actual es el primero sin terminar; si están todos, el último.
  const actual = pasos.findIndex((p) => !p.hecho)
  const indice = actual === -1 ? pasos.length - 1 : actual

  return (
    <ol className="flex flex-wrap items-center gap-y-2 text-sm" aria-label="Etapas del pedido">
      {pasos.map((p, i) => {
        const esActual = i === indice && !terminado
        return (
          <li key={p.nombre} className="flex items-center" aria-current={esActual ? 'step' : undefined}>
            {i > 0 && <span className={`mx-2 h-px w-6 sm:w-10 ${p.hecho || esActual ? 'bg-brand-500' : 'bg-line/15'}`} aria-hidden />}
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                p.hecho ? 'bg-brand-600 text-white' : esActual ? 'border-2 border-brand-500 text-brand-600' : 'border border-line/20 text-ink/40'
              }`}
              aria-hidden
            >
              {p.hecho ? '✓' : i + 1}
            </span>
            <span className={`ml-2 ${esActual ? 'font-medium text-ink' : p.hecho ? 'text-ink/70' : 'text-ink/45'}`}>{p.nombre}</span>
          </li>
        )
      })}
    </ol>
  )
}
