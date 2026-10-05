import { exigirAdmin } from '@/lib/auth'
import { duracion } from '@/lib/formato'
import { PRIORIDADES, type Perfil, type Sector } from '@/lib/tipos'
import { guardarSector, guardarSla, guardarUsuario } from './acciones'

export default async function Admin() {
  const { db, perfil: yo } = await exigirAdmin()
  const [rs, rsla, rp, ras] = await Promise.all([
    db.from('sectores').select('*').order('orden'),
    db.from('sla_politicas').select('*'),
    db.from('perfiles').select('*').order('rol').order('nombre').limit(1000),
    db.from('agente_sectores').select('*'),
  ])
  const sectores = (rs.data ?? []) as Sector[]
  const sla = new Map((rsla.data ?? []).map((x) => [x.prioridad as string, x as { minutos_respuesta: number; minutos_resolucion: number }]))
  const usuarios = (rp.data ?? []) as Perfil[]
  const asignados = (ras.data ?? []) as { perfil_id: string; sector_id: string }[]

  return (
    <div className="space-y-8">
      <div>
        <h1>Administración</h1>
        <p className="text-sm text-ink/60">Sectores, tiempos de SLA y permisos de las personas.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2>Sectores</h2>
          <p className="text-sm text-ink/60">
            La descripción es lo que lee la IA para decidir a dónde derivar: cuanto más concreta, mejor deriva.
          </p>
        </div>
        <div className="space-y-2">
          {sectores.map((s) => (
            <form key={s.id} action={guardarSector.bind(null, s.id)} className="tarjeta grid gap-3 p-3 md:grid-cols-[11rem_1fr_4.5rem_auto_auto] md:items-start">
              <input name="nombre" defaultValue={s.nombre} required className="campo" aria-label="Nombre" />
              <textarea name="descripcion" defaultValue={s.descripcion} rows={2} className="campo" aria-label="Descripción" />
              <input name="orden" type="number" defaultValue={s.orden} className="campo" aria-label="Orden" />
              <label className="flex items-center gap-1.5 py-2 text-sm">
                <input type="checkbox" name="activo" defaultChecked={s.activo} className="accent-brand-600" /> Activo
              </label>
              <button className="btn-sec">Guardar</button>
            </form>
          ))}
          <form action={guardarSector.bind(null, null)} className="grid gap-3 rounded-lg border border-dashed border-line/20 p-3 md:grid-cols-[11rem_1fr_4.5rem_auto] md:items-start">
            <input name="nombre" required placeholder="Nuevo sector" className="campo" />
            <textarea name="descripcion" rows={2} placeholder="Qué tipo de pedidos atiende" className="campo" />
            <input name="orden" type="number" defaultValue={sectores.length + 1} className="campo" aria-label="Orden" />
            <button className="btn">Agregar</button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2>Tiempos de SLA</h2>
          <p className="text-sm text-ink/60">
            En minutos, corridos (24×7). El reloj de resolución se pausa mientras el ticket está En espera. Los cambios aplican a tickets nuevos o cuando se cambia la prioridad.
          </p>
        </div>
        <form action={guardarSla} className="tarjeta overflow-x-auto">
          <table className="tabla data">
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Primera respuesta (min)</th>
                <th>Resolución (min)</th>
                <th>Hoy equivale a</th>
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
          <h2>Personas</h2>
          <p className="text-sm text-ink/60">
            Quien se registra entra como usuario externo. Acá lo pasás a agente o administrador, lo marcás como interno y le asignás sectores.
          </p>
        </div>
        <div className="space-y-2">
          {usuarios.map((u) => (
            <form key={u.id} action={guardarUsuario.bind(null, u.id)} className="tarjeta grid gap-3 p-3 lg:grid-cols-[14rem_8rem_8rem_10rem_1fr_auto] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{u.nombre || '—'}</p>
                <p className="truncate text-xs text-ink/50">{u.email}</p>
              </div>
              <select name="rol" defaultValue={u.rol} disabled={u.id === yo.id} className="campo" aria-label="Rol">
                <option value="usuario">Usuario</option>
                <option value="agente">Agente</option>
                <option value="admin">Administrador</option>
              </select>
              <select name="tipo" defaultValue={u.tipo} className="campo" aria-label="Tipo">
                <option value="externo">Externo</option>
                <option value="interno">Interno</option>
              </select>
              <input name="organizacion" defaultValue={u.organizacion} placeholder="Organización" className="campo" />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {u.rol !== 'usuario' &&
                  sectores.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="sectores"
                        value={s.id}
                        defaultChecked={asignados.some((a) => a.perfil_id === u.id && a.sector_id === s.id)}
                        className="accent-brand-600"
                      />
                      {s.nombre}
                    </label>
                  ))}
              </div>
              <button className="btn-sec">Guardar</button>
            </form>
          ))}
        </div>
      </section>
    </div>
  )
}
