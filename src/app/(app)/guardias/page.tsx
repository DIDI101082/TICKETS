import { exigirSupervisor } from '@/lib/auth'
import { hoyLocal } from '@/lib/asignacion'
import type { Sector } from '@/lib/tipos'
import { agregarGuardia, quitarGuardia } from '../admin/acciones2'

const dia = (f: string) => f.split('-').reverse().join('/')

export default async function Guardias() {
  const { db } = await exigirSupervisor()
  const hoy = hoyLocal()
  const [rg, rs, rp] = await Promise.all([
    db.from('guardias').select('*').gte('hasta', hoy).order('desde'),
    db.from('sectores').select('*').eq('activo', true).order('orden'),
    db.from('perfiles').select('id,nombre,email,ausente_hasta').in('rol', ['admin', 'agente']).eq('activo', true).order('nombre'),
  ])
  const guardias = (rg.data ?? []) as { id: string; sector_id: string; perfil_id: string; desde: string; hasta: string }[]
  const sectores = (rs.data ?? []) as Sector[]
  const agentes = (rp.data ?? []) as { id: string; nombre: string; email: string; ausente_hasta: string | null }[]
  const nombre = (id: string) => {
    const a = agentes.find((x) => x.id === id)
    return a ? a.nombre || a.email : 'Cuenta desactivada'
  }
  const ausentes = agentes.filter((a) => a.ausente_hasta && a.ausente_hasta >= hoy)

  return (
    <div className="space-y-6">
      <div>
        <h1>Guardias y ausencias</h1>
        <p className="text-sm text-ink/60">
          Quien está de guardia recibe primero los tickets nuevos de su sector (si el sector tiene reparto automático) y los escalamientos. Los ausentes no reciben asignaciones.
        </p>
      </div>

      <section className="space-y-3">
        <h2>Guardias vigentes y próximas</h2>
        <div className="tarjeta overflow-x-auto">
          {guardias.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/60">No hay guardias cargadas.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Persona</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {guardias.map((g) => (
                  <tr key={g.id}>
                    <td>{sectores.find((s) => s.id === g.sector_id)?.nombre ?? '—'}</td>
                    <td className="font-medium">
                      {nombre(g.perfil_id)}
                      {g.desde <= hoy && <span className="pill ml-2 bg-emerald-50 text-emerald-700">Hoy</span>}
                    </td>
                    <td>{dia(g.desde)}</td>
                    <td>{dia(g.hasta)}</td>
                    <td className="text-right">
                      <form action={quitarGuardia.bind(null, g.id)}>
                        <button className="text-xs text-ink/50 hover:text-red-700">Quitar</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form action={agregarGuardia} className="flex flex-wrap items-end gap-2 border-t border-line/[0.06] p-3">
            <select name="sector_id" required className="campo w-auto" aria-label="Sector" defaultValue="">
              <option value="" disabled>Sector…</option>
              {sectores.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            <select name="perfil_id" required className="campo w-auto" aria-label="Persona" defaultValue="">
              <option value="" disabled>Persona…</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre || a.email}</option>
              ))}
            </select>
            <div>
              <label className="rotulo" htmlFor="g_desde">Desde</label>
              <input id="g_desde" type="date" name="desde" required defaultValue={hoy} className="campo" />
            </div>
            <div>
              <label className="rotulo" htmlFor="g_hasta">Hasta</label>
              <input id="g_hasta" type="date" name="hasta" required defaultValue={hoy} className="campo" />
            </div>
            <button className="btn">Agregar guardia</button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <h2>Ausentes</h2>
        <div className="tarjeta p-4 text-sm">
          {ausentes.length === 0 ? (
            <p className="text-ink/60">Nadie está marcado como ausente.</p>
          ) : (
            <ul className="space-y-1">
              {ausentes.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.nombre || a.email}</span> <span className="text-ink/55">hasta el {dia(a.ausente_hasta!)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink/45">Cada agente carga su ausencia en “Mi cuenta”. Un administrador también puede hacerlo desde Personas.</p>
        </div>
      </section>
    </div>
  )
}
