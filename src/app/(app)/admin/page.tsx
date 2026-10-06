import { exigirAdmin } from '@/lib/auth'
import { leerHorario, leerMantenimiento, leerOpciones } from '@/lib/config'
import { agregarSlaEspecial, guardarMantenimiento, quitarSlaEspecial } from './acciones2'
import { duracion } from '@/lib/formato'
import { PRIORIDADES, type Sector } from '@/lib/tipos'
import { agregarFeriado, guardarHorario, guardarOpciones, guardarSector, guardarSla, quitarFeriado } from './acciones'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export default async function Admin() {
  const { db } = await exigirAdmin()
  const [rs, rsla, rp, rf, horario, opciones, mant, resp, rorg, rcat] = await Promise.all([
    db.from('sectores').select('*').order('orden'),
    db.from('sla_politicas').select('*'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']).order('nombre'),
    db.from('feriados').select('*').order('fecha'),
    leerHorario(),
    leerOpciones(),
    leerMantenimiento(),
    db.from('sla_especiales').select('*'),
    db.from('organizaciones').select('id,nombre').order('nombre'),
    db.from('categorias').select('id,nombre').order('orden'),
  ])
  const especiales = (resp.data ?? []) as { id: string; organizacion_id: string | null; categoria_id: string | null; prioridad: string; minutos_respuesta: number; minutos_resolucion: number }[]
  const orgs = (rorg.data ?? []) as { id: string; nombre: string }[]
  const cats = (rcat.data ?? []) as { id: string; nombre: string }[]
  const Reparto = ({ valor }: { valor?: string }) => (
    <select name="asignacion" defaultValue={valor ?? 'manual'} className="campo" aria-label="Reparto de tickets">
      <option value="manual">Reparto manual</option>
      <option value="turno">Por turno</option>
      <option value="carga">Al de menos carga</option>
    </select>
  )
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
            La descripción es lo que lee la IA para derivar. El responsable recibe los tickets escalados. El reparto automático asigna cada ticket nuevo a un agente del sector: por turno o al que menos tiene; quien está de guardia tiene prioridad y los ausentes quedan afuera.
          </p>
        </div>
        <div className="space-y-2">
          {sectores.map((s) => (
            <form key={s.id} action={guardarSector.bind(null, s.id)} className="tarjeta grid gap-3 p-3 lg:grid-cols-[9rem_1fr_11rem_10rem_4rem_auto_auto] lg:items-start">
              <input name="nombre" defaultValue={s.nombre} required className="campo" aria-label="Nombre" />
              <textarea name="descripcion" defaultValue={s.descripcion} rows={2} className="campo" aria-label="Descripción" />
              <Responsable valor={s.responsable_id} />
              <Reparto valor={s.asignacion} />
              <input name="orden" type="number" defaultValue={s.orden} className="campo" aria-label="Orden" />
              <label className="flex items-center gap-1.5 py-2 text-sm">
                <input type="checkbox" name="activo" defaultChecked={s.activo} className="accent-brand-600" /> Activo
              </label>
              <button className="btn-sec">Guardar</button>
            </form>
          ))}
          <form action={guardarSector.bind(null, null)} className="grid gap-3 rounded-xl border border-dashed border-line/20 p-3 lg:grid-cols-[9rem_1fr_11rem_10rem_4rem_auto] lg:items-start">
            <input name="nombre" required placeholder="Nuevo sector" className="campo" />
            <textarea name="descripcion" rows={2} placeholder="Qué tipo de pedidos atiende" className="campo" />
            <Responsable />
            <Reparto />
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

      <section className="space-y-3">
        <div>
          <h2>Tiempos especiales</h2>
          <p className="text-sm text-ink/60">Para un cliente o un tipo de pedido con tiempos distintos a los generales. Si hay una regla para la organización y otra para la categoría, gana la que tiene las dos.</p>
        </div>
        <div className="tarjeta overflow-x-auto">
          {especiales.length > 0 && (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Organización</th>
                  <th>Categoría</th>
                  <th>Prioridad</th>
                  <th>Respuesta</th>
                  <th>Resolución</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {especiales.map((e) => (
                  <tr key={e.id}>
                    <td>{orgs.find((o) => o.id === e.organizacion_id)?.nombre ?? 'Cualquiera'}</td>
                    <td>{cats.find((c) => c.id === e.categoria_id)?.nombre ?? 'Cualquiera'}</td>
                    <td>{PRIORIDADES.find((p) => p.valor === e.prioridad)?.etiqueta}</td>
                    <td>{duracion(e.minutos_respuesta)}</td>
                    <td>{duracion(e.minutos_resolucion)}</td>
                    <td className="text-right">
                      <form action={quitarSlaEspecial.bind(null, e.id)}>
                        <button className="text-xs text-ink/50 hover:text-red-700">Quitar</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form action={agregarSlaEspecial} className="flex flex-wrap items-end gap-2 p-3">
            <select name="organizacion_id" className="campo w-auto" aria-label="Organización" defaultValue="">
              <option value="">Cualquier organización</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.nombre}</option>
              ))}
            </select>
            <select name="categoria_id" className="campo w-auto" aria-label="Categoría" defaultValue="">
              <option value="">Cualquier categoría</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <select name="prioridad" className="campo w-auto" aria-label="Prioridad" defaultValue="media">
              {PRIORIDADES.map((p) => (
                <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
              ))}
            </select>
            <input name="minutos_respuesta" type="number" min={1} required placeholder="Respuesta (min)" className="campo w-36" />
            <input name="minutos_resolucion" type="number" min={1} required placeholder="Resolución (min)" className="campo w-36" />
            <button className="btn-sec">Agregar</button>
          </form>
        </div>
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

      <section>
        <form action={guardarMantenimiento} className="tarjeta space-y-4 p-4">
          <h2>Mantenimiento automático</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="rotulo" htmlFor="m_cerrar">Cerrar los resueltos después de (días)</label>
              <input id="m_cerrar" name="cerrar_resueltos_dias" type="number" min={0} defaultValue={mant.cerrar_resueltos_dias} className="campo" />
              <p className="mt-1 text-xs text-ink/45">Mientras está resuelto, el usuario puede reabrirlo. 0 lo desactiva.</p>
            </div>
            <div>
              <label className="rotulo" htmlFor="m_recordar">Recordar al usuario tras (días) en espera</label>
              <input id="m_recordar" name="recordar_espera_dias" type="number" min={0} defaultValue={mant.recordar_espera_dias} className="campo" />
              <p className="mt-1 text-xs text-ink/45">Un solo recordatorio por cada vez que queda en espera. 0 lo desactiva.</p>
            </div>
            <div>
              <label className="rotulo" htmlFor="m_adj">Borrar adjuntos tras (meses) de resuelto</label>
              <input id="m_adj" name="borrar_adjuntos_meses" type="number" min={0} defaultValue={mant.borrar_adjuntos_meses} className="campo" />
              <p className="mt-1 text-xs text-ink/45">Borra los archivos, no el ticket. No se puede deshacer. 0 los conserva siempre.</p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="tablero_solo_supervisores" defaultChecked={mant.tablero_solo_supervisores} className="mt-0.5 accent-brand-600" />
            <span>
              <span className="font-medium">El tablero y los reportes los ven solo supervisores y administradores</span>
              <span className="block text-ink/60">Un supervisor es un agente con esa marca en Personas. También puede cargar guardias.</span>
            </span>
          </label>
          <button className="btn-sec">Guardar mantenimiento</button>
        </form>
      </section>
    </div>
  )
}
