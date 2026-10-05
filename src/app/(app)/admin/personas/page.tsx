import { exigirAdmin } from '@/lib/auth'
import type { Organizacion, Perfil, Sector } from '@/lib/tipos'
import { guardarUsuario } from '../acciones'

export default async function Personas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const { db, perfil: yo } = await exigirAdmin()
  const [rs, rp, ras, ro] = await Promise.all([
    db.from('sectores').select('*').order('orden'),
    db.from('perfiles').select('*').order('rol').order('nombre').limit(2000),
    db.from('agente_sectores').select('*'),
    db.from('organizaciones').select('*').order('nombre'),
  ])
  const sectores = (rs.data ?? []) as Sector[]
  const orgs = (ro.data ?? []) as Organizacion[]
  const asignados = (ras.data ?? []) as { perfil_id: string; sector_id: string }[]
  const busca = q.trim().toLowerCase()
  const usuarios = ((rp.data ?? []) as Perfil[]).filter((u) => !busca || `${u.nombre} ${u.email}`.toLowerCase().includes(busca))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Personas</h1>
          <p className="text-sm text-ink/60">
            Quien se registra entra como usuario externo. Acá definís rol, organización y sectores. Un “referente” ve todos los tickets de su organización.
          </p>
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o mail" className="campo w-60" />
          <button className="btn-sec">Buscar</button>
        </form>
      </div>
      <div className="space-y-2">
        {usuarios.map((u) => (
          <form key={u.id} action={guardarUsuario.bind(null, u.id)} className="tarjeta grid gap-3 p-3 lg:grid-cols-[13rem_8rem_7rem_11rem_1fr_auto] lg:items-center">
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
          </form>
        ))}
        {usuarios.length === 0 && <p className="tarjeta p-6 text-center text-sm text-ink/60">No hay personas con esa búsqueda.</p>}
      </div>
    </div>
  )
}
