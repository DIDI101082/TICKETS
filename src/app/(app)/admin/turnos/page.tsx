import Link from 'next/link'
import { exigirAdmin } from '@/lib/auth'
import type { Bloqueo, Lugar } from '@/lib/turnos-calc'
import type { Sector } from '@/lib/tipos'
import { agregarBloqueo, guardarLugar, quitarBloqueo } from './acciones'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const ERROR: Record<string, string> = {
  nombre: 'Poné un nombre.', horario: 'La hora de fin tiene que ser posterior a la de inicio.', repetido: 'Ya hay un lugar con ese nombre.',
  fechas: 'Revisá las fechas.', guardar: 'No se pudo guardar. ¿Ejecutaste 009_diagnostico_turnos_equipo.sql?',
}

function FormLugar({ l, sectores }: { l?: Lugar; sectores: Sector[] }) {
  return (
    <form action={guardarLugar.bind(null, l?.id ?? null)} className={`space-y-3 p-4 ${l ? 'tarjeta' : 'rounded-xl border border-dashed border-line/20'}`}>
      <div className="grid gap-3 md:grid-cols-[1fr_10rem_12rem]">
        <input name="nombre" required maxLength={80} defaultValue={l?.nombre} className="campo" placeholder="CAU · Piso 4" aria-label="Nombre" />
        <select name="modalidad" defaultValue={l?.modalidad ?? 'presencial'} className="campo" aria-label="Modalidad">
          <option value="presencial">Presencial</option>
          <option value="remoto">Remoto (Teams)</option>
        </select>
        <select name="sector_id" defaultValue={l?.sector_id ?? ''} className="campo" aria-label="Sector">
          <option value="">Sin sector</option>
          {sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>
      <input name="indicaciones" maxLength={500} defaultValue={l?.indicaciones} className="campo" placeholder="Indicaciones que le llegan a la persona (dónde es, qué traer)" aria-label="Indicaciones" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex gap-1">
          {DIAS.map((d, i) => (
            <label key={d} className="flex items-center gap-0.5">
              <input type="checkbox" name="dias" value={i} defaultChecked={(l?.dias ?? [1, 2, 3, 4, 5]).includes(i)} className="accent-brand-600" />{d}
            </label>
          ))}
        </span>
        <label className="flex items-center gap-1">De <input name="desde" type="time" defaultValue={(l?.desde ?? '10:00').slice(0, 5)} className="campo w-auto py-1" /></label>
        <label className="flex items-center gap-1">a <input name="hasta" type="time" defaultValue={(l?.hasta ?? '17:00').slice(0, 5)} className="campo w-auto py-1" /></label>
        <label className="flex items-center gap-1">Turnos de <input name="duracion_min" type="number" min={10} max={240} step={5} defaultValue={l?.duracion_min ?? 30} className="campo w-20 py-1" /> min</label>
        <label className="flex items-center gap-1" title="Cuántas personas se pueden atender al mismo tiempo">A la vez <input name="capacidad" type="number" min={1} max={20} defaultValue={l?.capacidad ?? 1} className="campo w-16 py-1" /></label>
        <label className="flex items-center gap-1" title="Con cuánta anticipación mínima se puede reservar">Anticipación <input name="anticipacion_horas" type="number" min={0} max={168} defaultValue={l?.anticipacion_horas ?? 2} className="campo w-16 py-1" /> h</label>
        <label className="flex items-center gap-1">Orden <input name="orden" type="number" min={0} max={999} defaultValue={l?.orden ?? 0} className="campo w-16 py-1" /></label>
        {l && <label className="flex items-center gap-1"><input type="checkbox" name="activo" defaultChecked={l.activo} className="accent-brand-600" /> Activo</label>}
        <button className={l ? 'btn-sec' : 'btn'}>{l ? 'Guardar' : 'Agregar lugar'}</button>
      </div>
    </form>
  )
}

export default async function AdminTurnos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams
  const { db } = await exigirAdmin()
  const [{ data: rl, error }, { data: rb }, { data: rs }] = await Promise.all([
    db.from('turno_lugares').select('*').order('orden').order('nombre'),
    db.from('turno_bloqueos').select('*').gte('hasta', new Date().toISOString().slice(0, 10)).order('desde'),
    db.from('sectores').select('*').eq('activo', true).order('orden'),
  ])
  const lugares = (rl ?? []) as Lugar[]
  const bloqueos = (rb ?? []) as Bloqueo[]
  const sectores = (rs ?? []) as Sector[]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Turnos</h1>
          <p className="max-w-3xl text-sm text-ink/60">Dónde y cuándo atiende el CAU con turno. La gente reserva desde “Turnos” y el equipo los ve en la agenda. Le llega confirmación por mail y un recordatorio el día anterior.</p>
        </div>
        <Link href="/turnos/agenda" className="btn-sec">Ver la agenda</Link>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Falta ejecutar supabase/009_diagnostico_turnos_equipo.sql.</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardamos los cambios.</p>}
      {sp.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR[sp.error] ?? ERROR.guardar}</p>}

      <section className="space-y-3">
        <h2>Lugares y horarios</h2>
        {lugares.map((l) => <FormLugar key={l.id} l={l} sectores={sectores} />)}
        <FormLugar sectores={sectores} />
      </section>

      <section className="space-y-3">
        <h2>Días sin atención</h2>
        <p className="text-sm text-ink/60">Feriados, vacaciones del equipo o días con todo el CAU ocupado. Esos días no se ofrecen turnos (los ya reservados no se cancelan solos).</p>
        {bloqueos.length > 0 && (
          <ul className="tarjeta divide-y divide-line/[0.06] text-sm">
            {bloqueos.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>{b.desde === b.hasta ? b.desde : `${b.desde} a ${b.hasta}`} · {b.lugar_id ? lugares.find((l) => l.id === b.lugar_id)?.nombre : 'Todos los lugares'}{b.motivo ? ` · ${b.motivo}` : ''}</span>
                <form action={quitarBloqueo.bind(null, b.id)}><button className="text-ink/55 hover:text-red-700">Quitar</button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={agregarBloqueo} className="flex flex-wrap items-end gap-2 text-sm">
          <label>Desde<input name="desde" type="date" required className="campo mt-1 w-auto" /></label>
          <label>Hasta<input name="hasta" type="date" className="campo mt-1 w-auto" /></label>
          <label>Lugar
            <select name="lugar_id" className="campo mt-1 w-auto">
              <option value="">Todos</option>
              {lugares.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </label>
          <label className="min-w-48 flex-1">Motivo<input name="motivo" maxLength={120} className="campo mt-1" placeholder="Feriado, inventario anual…" /></label>
          <button className="btn-sec">Agregar</button>
        </form>
      </section>
    </div>
  )
}
