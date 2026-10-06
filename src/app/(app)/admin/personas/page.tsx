import { exigirAdmin } from '@/lib/auth'
import type { Organizacion, Perfil, Sector } from '@/lib/tipos'
import { guardarUsuario } from '../acciones'
import { anonimizar, cambiarActivo } from '../acciones2'
import Alta from './Alta'

export default async function Personas({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  const sp = await searchParams
  const { db, perfil: yo } = await exigirAdmin()
  const [rs, rp, ras, ro] = await Promise.all([
    db.from('sectores').select('*').eq('activo', true).order('orden'),
    db.from('perfiles').select('*').order('rol').order('nombre').limit(3000),
    db.from('agente_sectores').select('*'),
    db.from('organizaciones').select('*').order('nombre'),
  ])
  const sectores = (rs.data ?? []) as Sector[]
  const orgs = (ro.data ?? []) as Organizacion[]
  const asignados = (ras.data ?? []) as { perfil_id: string; sector_id: string }[]
  const todos = (rp.data ?? []) as Perfil[]
  const mailDe = new Map(todos.map((p) => [p.id, p.email]))
  const busca = (sp.q ?? '').trim().toLowerCase()
  const inactivas = sp.ver === 'inactivas'
  const usuarios = todos.filter((u) => (u.activo !== false) !== inactivas && (!busca || `${u.nombre} ${u.email}`.toLowerCase().includes(busca)))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Personas</h1>
          <p className="text-sm text-ink/60">Cuentas, roles, organización, sectores y jefe de cada persona.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar por nombre o mail" className="campo w-56" />
          <select name="ver" defaultValue={sp.ver ?? ''} className="campo w-auto" aria-label="Estado de la cuenta">
            <option value="">Activas</option>
            <option value="inactivas">Desactivadas</option>
          </select>
          <button className="btn-sec">Buscar</button>
        </form>
      </div>

      <Alta />

      <div className="space-y-2">
        {usuarios.map((u) => (
          <div key={u.id} className={`tarjeta p-3 ${u.activo === false ? 'opacity-70' : ''}`}>
            <form action={guardarUsuario.bind(null, u.id)} className="grid gap-3 lg:grid-cols-[13rem_8rem_7rem_11rem_1fr_auto] lg:items-center">
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
              <select name="organizacion_id" defaultValue={u.organizacion_id ?? ''} className="campo" aria-label="Organización">
                <option value="">Sin organización</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {u.rol === 'usuario' ? (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="ve_organizacion" defaultChecked={u.ve_organizacion} className="accent-brand-600" /> Referente de su organización
                  </label>
                ) : (
                  sectores.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5">
                      <input type="checkbox" name="sectores" value={s.id} defaultChecked={asignados.some((a) => a.perfil_id === u.id && a.sector_id === s.id)} className="accent-brand-600" />
                      {s.nombre}
                    </label>
                  ))
                )}
              </div>
              <button className="btn-sec">Guardar</button>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm lg:col-span-6">
                <label className="flex items-center gap-1.5">
                  Jefe (mail)
                  <input name="jefe" type="email" defaultValue={u.jefe_id ? mailDe.get(u.jefe_id) ?? '' : ''} placeholder="jefe@empresa.com" className="campo w-56 py-1" />
                </label>
                {u.rol !== 'usuario' && (
                  <>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" name="supervisor" defaultChecked={u.supervisor} className="accent-brand-600" /> Supervisor
                    </label>
                    <label className="flex items-center gap-1.5">
                      Ausente hasta
                      <input name="ausente_hasta" type="date" defaultValue={u.ausente_hasta ?? ''} className="campo w-auto py-1" />
                    </label>
                  </>
                )}
              </div>
            </form>
            {u.id !== yo.id && (
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line/[0.06] pt-2 text-xs">
                <form action={cambiarActivo.bind(null, u.id, u.activo === false)}>
                  <button className="text-ink/55 hover:text-ink hover:underline">{u.activo === false ? 'Reactivar la cuenta' : 'Desactivar la cuenta'}</button>
                </form>
                <details>
                  <summary className="cursor-pointer text-ink/55 hover:text-red-700">Borrar sus datos personales</summary>
                  <form action={anonimizar.bind(null, u.id)} className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" name="confirmar" required className="accent-brand-600" /> Entiendo que no se puede deshacer: su nombre y su mail se quitan de todos sus tickets y la cuenta queda bloqueada.
                    </label>
                    <button className="font-medium text-red-700 hover:underline">Borrar datos</button>
                  </form>
                </details>
              </div>
            )}
          </div>
        ))}
        {usuarios.length === 0 && <p className="tarjeta p-6 text-center text-sm text-ink/60">No hay personas con ese criterio.</p>}
      </div>
    </div>
  )
}
