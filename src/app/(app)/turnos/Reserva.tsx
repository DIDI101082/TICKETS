'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Dia } from '@/lib/turnos-calc'
import { reservarTurno } from './acciones'

interface LugarVista {
  id: string
  nombre: string
  modalidad: 'presencial' | 'remoto'
  indicaciones: string
  dias: Dia[]
}

const diaCorto = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

function Confirmar({ listo }: { listo: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn" disabled={!listo || pending}>
      {pending ? 'Reservando…' : 'Reservar turno'}
    </button>
  )
}

export default function Reserva({
  lugares,
  motivos,
  ticket,
  equipo,
}: {
  lugares: LugarVista[]
  motivos: readonly string[]
  ticket: { id: string; numero: number; asunto: string } | null
  equipo: string
}) {
  const [lugarId, setLugarId] = useState(lugares[0]?.id ?? '')
  const lugar = lugares.find((l) => l.id === lugarId)
  const conLugar = (lugar?.dias ?? []).filter((d) => d.horarios.some((h) => h.libres > 0))
  const [fecha, setFecha] = useState(conLugar[0]?.fecha ?? '')
  const [inicio, setInicio] = useState('')
  const dia = lugar?.dias.find((d) => d.fecha === fecha)

  function elegirLugar(id: string) {
    setLugarId(id)
    const l = lugares.find((x) => x.id === id)
    setFecha(l?.dias.find((d) => d.horarios.some((h) => h.libres > 0))?.fecha ?? '')
    setInicio('')
  }

  if (!lugares.length) return <p className="tarjeta p-5 text-sm text-ink/60">Todavía no hay horarios de atención cargados.</p>

  return (
    <form action={reservarTurno} className="tarjeta space-y-5 p-5">
      <input type="hidden" name="lugar_id" value={lugarId} />
      <input type="hidden" name="inicio" value={inicio} />
      {ticket && <input type="hidden" name="ticket_id" value={ticket.id} />}
      {ticket && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Para el pedido #{ticket.numero}: {ticket.asunto}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="motivo">Para qué es</label>
          <select id="motivo" name="motivo" required className="campo" defaultValue="">
            <option value="" disabled>Elegí una opción…</option>
            {motivos.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="equipo">Equipo (si aplica)</label>
          <input id="equipo" name="equipo" defaultValue={equipo} maxLength={80} className="campo" placeholder="N.º de inventario, ej.: NB-0142" />
        </div>
      </div>
      <div>
        <label className="rotulo" htmlFor="detalle">Contanos un poco más (opcional)</label>
        <input id="detalle" name="detalle" maxLength={1000} className="campo" placeholder="Ej.: la batería dura una hora" />
      </div>

      <fieldset className="space-y-2">
        <legend className="rotulo">Dónde</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lugares.map((l) => (
            <label key={l.id} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${l.id === lugarId ? 'border-brand-500 bg-brand-50/60' : 'border-line/10'}`}>
              <input type="radio" name="_lugar" className="sr-only" checked={l.id === lugarId} onChange={() => elegirLugar(l.id)} />
              <span className="font-medium">{l.nombre}</span>
              <span className="block text-xs text-ink/55">{l.modalidad === 'remoto' ? 'Por Teams' : 'Presencial'}</span>
            </label>
          ))}
        </div>
        {lugar?.indicaciones && <p className="text-xs text-ink/55">{lugar.indicaciones}</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="rotulo">Día</legend>
        {lugar && lugar.dias.length === 0 ? (
          <p className="text-sm text-ink/60">No hay horarios en los próximos días para este lugar.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {lugar?.dias.map((d) => {
              const libres = d.horarios.filter((h) => h.libres > 0).length
              return (
                <button
                  key={d.fecha}
                  type="button"
                  disabled={!libres}
                  title={d.bloqueo || (libres ? `${libres} horarios libres` : 'Sin lugar')}
                  onClick={() => { setFecha(d.fecha); setInicio('') }}
                  className={`rounded-lg border px-3 py-1.5 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-40 ${d.fecha === fecha ? 'border-brand-500 bg-brand-600 text-white' : 'border-line/10 hover:border-brand-500'}`}
                >
                  {diaCorto(d.fecha)}
                  {d.bloqueo && <span className="block text-[10px] normal-case">{d.bloqueo}</span>}
                </button>
              )
            })}
          </div>
        )}
      </fieldset>

      {dia && dia.horarios.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="rotulo">Hora</legend>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
            {dia.horarios.map((h) => (
              <button
                key={h.inicio}
                type="button"
                disabled={h.libres < 1}
                onClick={() => setInicio(h.inicio)}
                className={`rounded-lg border px-2 py-1.5 text-sm tabular-nums disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${h.inicio === inicio ? 'border-brand-500 bg-brand-600 text-white' : 'border-line/10 hover:border-brand-500'}`}
              >
                {h.hora}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/10 pt-4">
        <p className="text-sm text-ink/60">
          {inicio && dia ? <>Elegiste el <strong className="capitalize text-ink">{diaCorto(dia.fecha)}</strong> a las <strong className="text-ink">{dia.horarios.find((h) => h.inicio === inicio)?.hora}</strong> · {lugar?.nombre}</> : 'Elegí día y hora.'}
        </p>
        <Confirmar listo={!!inicio} />
      </div>
    </form>
  )
}
