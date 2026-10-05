import { exigirAdmin } from '@/lib/auth'
import { leerHorario, leerOpciones } from '@/lib/config'
import { duracion } from '@/lib/formato'
import { PRIORIDADES, type Sector } from '@/lib/tipos'
import { agregarFeriado, guardarHorario, guardarOpciones, guardarSector, guardarSla, quitarFeriado } from './acciones'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export default async function Admin() {
  const { db } = await exigirAdmin()
  const [rs, rsla, rp, rf, horario, opciones] = await Promise.all([
    db.from('sectores').select('*').order('orden'),
    db.from('sla_politicas').select('*'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']).order('nombre'),
    db.from('feriados').select('*').order('fecha'),
    leerHorario(),
    leerOpciones(),
  ])
  const sectores = (rs.data ?? []) as Sector[]
  const sla = new Map((rsla.data ?? []).map((x) => [x.prioridad as string, x as { minutos_respuesta: number; minutos_resolucion: number }]))
  const staff = (rp.data ?? []) as { id: string; nombre: string; email: string }[]
  const feriados = (rf.data ?? []) as { fecha: string; nombre: string }[]

  const Responsable = ({ valor }: { valor?: string | null }) => (
    <select name="responsable_id" defaultValue={valor ?? ''} className="campo" aria-label="Responsable">
      <option value="">Sin responsable</option>
      {staff.map((p) => (
        <option key={p.id} value={p.id}>{p.nombre || p.email}</option>
      ))}
    </select>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1>Configuración general</h1>
        <p className="text-sm text-ink/60">Sectores, tiempos de SLA, horario de atención y reglas automáticas.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2>Sectores</h2>
          <p className="text-sm text-ink/60">
            La descripción es lo que lee la IA para derivar. El responsable recibe los tickets escalados de su sector.
          </p>
        </div>
        <div className="space-y-2">
          {sectores.map((s) => (
            <form key={s.id} action={guardarSector.bind(null, s.id)} className="tarjeta grid gap-3 p-3 lg:grid-cols-[10rem_1fr_12rem_4.5rem_auto_auto] lg:items-start">
              <input name="nombre" defaultValue={s.nombre} required className="campo" aria-label="Nombre" />
              <textarea name="descripcion" defaultValue={s.descripcion} rows={2} className="campo" aria-label="Descripción" />
              <Responsable valor={s.responsable_id} />
              <input name="orden" type="number" defaultValue={s.orden} className="campo" aria-label="Orden" />
              <label className="flex items-center gap-1.5 py-2 text-sm">
                <input type="checkbox" name="activo" defaultChecked={s.activo} className="accent-brand-600" /> Activo
              </label>
              <button className="btn-sec">Guardar</button>
            </form>
          ))}
          <form action={guardarSector.bind(null, null)} className="grid gap-3 rounded-xl border border-dashed border-line/20 p-3 lg:grid-cols-[10rem_1fr_12rem_4.5rem_auto] lg:items-start">
            <input name="nombre" required placeholder="Nuevo sector" className="campo" />
            <textarea name="descripcion" rows={2} placeholder="Qué tipo de pedidos atiende" className="campo" />
            <Responsable />
            <input name="orden" type="number" defaultValue={sectores.length + 1} className="campo" aria-label="Orden" />
            <button className="btn">Agregar</button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2>Tiempos de SLA</h2>
          <p className="text-sm text-ink/60">
            En minutos de atención. El reloj de resolución se pausa mientras el ticket está En espera. Al guardar se recalculan los tickets activos.
          </p>
        </div>
        <form action={guardarSla} className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Primera respuesta (min)</th>
                <th>Resolución (min)</th>
                <th>Equivale a</th>
              </tr>
            </thead>
            <tbody>
              {PRIORIDADES.map((p) => {
                const v = sla.get(p.valor)
                return (
                  <tr key={p.valor}>
                    <td className="font-medium">{p.etiqueta}</td>
                    <td><input name={`resp_${p.valor}`} type="number" min={1} defaultValue={v?.minutos_respuesta} className="campo w-28" /></td>
                    <td><input name={`resol_${p.valor}`} type="number" min={1} defaultValue={v?.minutos_resolucion} className="campo w-28" /></td>
                    <td className="text-ink/55">{v ? `${duracion(v.minutos_respuesta)} / ${duracion(v.minutos_resolucion)}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="p-3">
            <button className="btn-sec">Guardar tiempos</button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={guardarHorario} className="tarjeta space-y-3 p-4">
          <div>
            <h2>Horario de atención</h2>
            <p className="text-sm text-ink/60">Con el horario activado, el SLA solo cuenta el tiempo dentro de estos días y horas. Desactivado, corre 24×7.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="activo" defaultChecked={horario.activo} className="accent-brand-600" /> Contar el SLA solo en horario de atención
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {DIAS.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5">
                <input type="checkbox" name="dias" value={i + 1} defaultChecked={horario.dias.includes(i + 1)} className="accent-brand-600" /> {d}
              </label>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="rotulo" htmlFor="desde">Desde</label>
              <input id="desde" type="time" name="desde" defaultValue={horario.desde} className="campo" />
            </div>
            <div>
              <label className="rotulo" htmlFor="hasta">Hasta</label>
              <input id="hasta" type="time" name="hasta" defaultValue={horario.hasta} className="campo" />
            </div>
            <button className="btn-sec">Guardar horario</button>
          </div>
        </form>

        <div className="tarjeta space-y-3 p-4">
          <div>
            <h2>Feriados</h2>
            <p className="text-sm text-ink/60">Días que no cuentan para el SLA cuando el horario de atención está activado.</p>
          </div>
          <form action={agregarFeriado} className="flex flex-wrap items-end gap-2">
            <input type="date" name="fecha" required className="campo w-auto" aria-label="Fecha" />
            <input name="nombre" placeholder="Motivo (opcional)" className="campo w-48" />
            <button className="btn-sec">Agregar</button>
          </form>
          {feriados.length === 0 ? (
            <p className="text-sm text-ink/50">No hay feriados cargados.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
              {feriados.map((f) => (
                <li key={f.fecha} className="flex items-center justify-between gap-2">
                  <span>
                    {f.fecha.split('-').reverse().join('/')} <span className="text-ink/55">{f.nombre}</span>
                  </span>
                  <form action={quitarFeriado.bind(null, f.fecha)}>
                    <button className="text-xs text-ink/50 hover:text-red-700">Quitar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <form action={guardarOpciones} className="tarjeta space-y-4 p-4">
          <h2>Reglas automáticas</h2>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="restringir_sector" defaultChecked={opciones.restringir_sector} className="mt-0.5 accent-brand-600" />
            <span>
              <span className="font-medium">Cada agente ve solo los tickets de sus sectores</span>
              <span className="block text-ink/60">
                Además ve los que tiene asignados y los que están en triage. Los administradores ven todo. Antes de activarlo, asigná sectores a cada agente en Personas.
              </span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="rotulo" htmlFor="escalar">Escalar si nadie lo toma en (min)</label>
              <input id="escalar" name="escalar_sin_tomar_min" type="number" min={0} defaultValue={opciones.escalar_sin_tomar_min} className="campo" />
              <p className="mt-1 text-xs text-ink/45">0 lo desactiva. Con SLA vencido se escala siempre.</p>
            </div>
            <div>
              <label className="rotulo" htmlFor="inc_c">Incidente: tickets parecidos</label>
              <input id="inc_c" name="incidente_cantidad" type="number" min={0} defaultValue={opciones.incidente_cantidad} className="campo" />
              <p className="mt-1 text-xs text-ink/45">0 desactiva la detección.</p>
            </div>
            <div>
              <label className="rotulo" htmlFor="inc_m">Incidente: dentro de (min)</label>
              <input id="inc_m" name="incidente_minutos" type="number" min={5} defaultValue={opciones.incidente_minutos} className="campo" />
            </div>
          </div>
          <button className="btn-sec">Guardar reglas</button>
        </form>
      </section>
    </div>
  )
}
