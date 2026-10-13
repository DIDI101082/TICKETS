import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { cuando, datosAgenda, MOTIVOS, zonaTurnos, type Turno } from '@/lib/turnos'
import { horariosDe } from '@/lib/turnos-calc'
import { cancelarMiTurno } from './acciones'
import Reserva from './Reserva'

const ERROR: Record<string, string> = {
  ocupado: 'Ese horario se acaba de ocupar. Elegí otro.',
  superpuesto: 'Ya tenés otro turno en ese horario.',
  limite: 'Ya tenés 3 turnos reservados. Cancelá alguno para pedir otro.',
  datos: 'Revisá los datos del turno.',
}

export default async function Turnos({ searchParams }: { searchParams: Promise<{ ticket?: string; equipo?: string; ok?: string; error?: string; cancelado?: string }> }) {
  const sp = await searchParams
  const { db, perfil } = await sesion()
  const zona = await zonaTurnos()
  const [{ lugares, bloqueos, ocupados }, { data: rmios }, { data: rt }] = await Promise.all([
    datosAgenda(new Date(), new Date(Date.now() + 32 * 86400000)),
    db.from('turnos').select('*, turno_lugares(nombre,indicaciones,modalidad)').eq('perfil_id', perfil.id).order('inicio', { ascending: false }).limit(15),
    sp.ticket ? db.from('tickets').select('id,numero,asunto,equipo,estado').eq('id', sp.ticket).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const mios = (rmios ?? []) as (Turno & { turno_lugares: { nombre: string; indicaciones: string; modalidad: string } | null })[]
  const ahora = Date.now()
  const proximos = mios.filter((t) => t.estado === 'reservado' && new Date(t.fin).getTime() > ahora).reverse()
  const pasados = mios.filter((t) => !proximos.includes(t)).slice(0, 5)
  const ticket = rt && rt.estado !== 'cerrado' ? (rt as { id: string; numero: number; asunto: string; equipo: string }) : null
  const vista = lugares
    .filter((l) => l.activo)
    .map((l) => ({ id: l.id, nombre: l.nombre, modalidad: l.modalidad, indicaciones: l.indicaciones, dias: horariosDe(l, { ocupados, bloqueos, zona, dias: 10 }) }))
  const recien = sp.ok ? mios.find((t) => t.id === sp.ok) : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1>Turnos con el CAU</h1>
        <p className="text-sm text-ink/60">Reservá día y hora para que te atiendan, en tu piso o por Teams. Sin esperas ni “¿cuándo pasan?”.</p>
      </div>

      {recien && (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong>¡Listo! Tu turno quedó reservado para el {cuando(recien, zona)}</strong> en {recien.turno_lugares?.nombre}. Te mandamos la confirmación por mail y un recordatorio el día anterior.{' '}
          <a href={`/api/turnos/${recien.id}`} className="underline">Agregar a mi calendario</a>
        </div>
      )}
      {sp.cancelado && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Cancelamos el turno. ¡Gracias por avisar!</p>}
      {sp.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR[sp.error] ?? ERROR.datos}</p>}

      {proximos.length > 0 && (
        <section className="space-y-2">
          <h2>Tus próximos turnos</h2>
          <ul className="tarjeta divide-y divide-line/[0.06]">
            {proximos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium first-letter:uppercase">{cuando(t, zona)}</p>
                  <p className="text-ink/60">{t.turno_lugares?.nombre} · {t.motivo}{t.equipo ? ` · ${t.equipo}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <a href={`/api/turnos/${t.id}`} className="text-brand-600 hover:underline">Agregar al calendario</a>
                  <form action={cancelarMiTurno.bind(null, t.id)}>
                    <button className="text-ink/55 hover:text-red-700">Cancelar</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2>{proximos.length ? 'Pedir otro turno' : 'Pedir un turno'}</h2>
        <Reserva lugares={vista} motivos={MOTIVOS} ticket={ticket ? { id: ticket.id, numero: ticket.numero, asunto: ticket.asunto } : null} equipo={ticket?.equipo || (sp.equipo ?? '').slice(0, 80)} />
        <p className="text-xs text-ink/45">¿Es urgente o algo que no puede esperar? <Link href="/portal/nuevo" className="text-brand-600 hover:underline">Cargá un pedido</Link>.</p>
      </section>

      {pasados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base">Anteriores</h2>
          <ul className="space-y-1 text-sm text-ink/60">
            {pasados.map((t) => (
              <li key={t.id}>
                <span className="first-letter:uppercase">{cuando(t, zona)}</span> · {t.turno_lugares?.nombre} · {t.motivo} ·{' '}
                {t.estado === 'cancelado' ? 'Cancelado' : t.estado === 'ausente' ? 'No te presentaste' : t.estado === 'atendido' ? 'Atendido' : 'Pasado'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
