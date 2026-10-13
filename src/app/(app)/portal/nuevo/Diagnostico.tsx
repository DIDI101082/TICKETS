'use client'

import { useEffect, useState, useTransition } from 'react'
import type { Diagnostico as Resultado, Hallazgo } from '@/lib/diagnostico'
import { revisarAntes, seSoluciono } from './acciones'

// Panel "Revisamos tu equipo": aparece al elegir una categoría con diagnóstico.
// Muestra lo que encontramos en los datos de Accusys Cyber y cómo resolverlo antes de enviar el pedido.

const COLOR: Record<Hallazgo['gravedad'], string> = {
  alta: 'border-l-red-500',
  media: 'border-l-amber-500',
  info: 'border-l-ink/20',
}

const enlazar = (t: string) =>
  t.split(/(https:\/\/\S+)/).map((p, i) =>
    /^https:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener" className="text-brand-600 underline">{p.replace('https://', '')}</a> : p,
  )

export default function Diagnostico({ categoriaId, equipo }: { categoriaId: string; equipo: string }) {
  const [r, setR] = useState<(Resultado & { id: string; actualizado: string | null }) | null>(null)
  const [cargando, iniciar] = useTransition()
  const [cerrando, cerrar] = useTransition()

  useEffect(() => {
    setR(null)
    iniciar(async () => {
      try {
        setR(await revisarAntes(categoriaId, equipo))
      } catch {
        setR(null)
      }
    })
    // El equipo elegido se toma solo al abrir el panel, para no repetir la consulta en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId])

  if (cargando) return <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink/55">Revisando tu equipo y tu cuenta…</p>
  if (!r) return null
  const porVos = r.hallazgos.filter((h) => h.porVos)

  return (
    <section className="space-y-3 rounded-xl border border-brand-500/40 bg-brand-50/50 p-4">
      <input type="hidden" name="autoservicio_id" value={r.id} />
      <div>
        <h2 className="text-base">{r.hallazgos.length ? 'Antes de enviar: revisamos tu equipo y tu cuenta' : 'Revisamos tu equipo y tu cuenta: no vemos nada raro'}</h2>
        <p className="text-xs text-ink/55">
          Con los datos del inventario{r.actualizado ? ` (último reporte: ${new Date(r.actualizado).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })})` : ''}.
          {r.hallazgos.length ? ' Probá esto; muchas veces se resuelve en dos minutos.' : ' Igual probá esto primero:'}
        </p>
      </div>

      {r.hallazgos.length > 0 && (
        <ul className="space-y-2">
          {r.hallazgos.map((h) => (
            <li key={h.id} className={`rounded-lg border-l-4 bg-surface px-3 py-2 text-sm ${COLOR[h.gravedad]}`}>
              <p className="font-medium">{h.titulo}</p>
              <p className="text-ink/65">{enlazar(h.detalle)}</p>
              {h.pasos.length > 0 && (
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink/80">
                  {h.pasos.map((p) => <li key={p}>{enlazar(p)}</li>)}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}

      <details open={!r.hallazgos.length} className="text-sm">
        <summary className="cursor-pointer text-ink/60">{r.hallazgos.length ? 'Otras cosas para probar' : 'Lo básico'}</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink/75">
          {r.probaPrimero.map((p) => <li key={p}>{enlazar(p)}</li>)}
        </ul>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-line/10 pt-3 text-sm">
        <button type="button" className="btn-sec" disabled={cerrando} onClick={() =>
            cerrar(() => {
              try {
                localStorage.removeItem('ticket-borrador')
              } catch {}
              return seSoluciono(r.id)
            })
          }>
          {cerrando ? 'Listo…' : 'Se solucionó, no hace falta el pedido'}
        </button>
        <span className="text-ink/55">
          {porVos.length || !r.hallazgos.length ? 'Si sigue igual, completá el pedido abajo: le pasamos esto a quien lo atienda.' : 'Esto lo resolvemos nosotros: completá el pedido abajo.'}
        </span>
      </div>
    </section>
  )
}
