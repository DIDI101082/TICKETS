import { exigirAdmin } from '@/lib/auth'
import type { Regla } from '@/lib/reglas'
import { PRIORIDADES } from '@/lib/tipos'
import { eliminarRegla, guardarRegla } from '../acciones2'

type Opcion = { id: string; nombre: string }

function Lista({ nombre, valor, vacio, opciones }: { nombre: string; valor?: string; vacio: string; opciones: Opcion[] }) {
  return (
    <select name={nombre} defaultValue={valor ?? ''} className="campo">
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>{o.nombre}</option>
      ))}
    </select>
  )
}

const CANALES: Opcion[] = [
  { id: 'portal', nombre: 'Portal' },
  { id: 'email', nombre: 'Email' },
  { id: 'teams', nombre: 'Teams' },
  { id: 'telefono', nombre: 'Teléfono o en persona' },
  { id: 'monitoreo', nombre: 'Monitoreo' },
]

function Formulario({ r, orden, cats, orgs, sectores, agentes }: { r?: Regla; orden: number; cats: Opcion[]; orgs: Opcion[]; sectores: Opcion[]; agentes: Opcion[] }) {
  return (
    <form action={guardarRegla.bind(null, r?.id ?? null)} className={`space-y-3 p-4 ${r ? 'tarjeta' : 'rounded-xl border border-dashed border-line/20'}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <div>
          <label className="rotulo">{r ? 'Nombre de la regla' : 'Nueva regla'}</label>
          <input name="nombre" required defaultValue={r?.nombre} placeholder="Ej.: Pedidos del cliente X, prioridad alta" className="campo" />
        </div>
        <div>
          <label className="rotulo">Orden</label>
          <input name="orden" type="number" defaultValue={r?.orden ?? orden} className="campo" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="space-y-2 rounded-lg bg-canvas p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink/50">Si el ticket…</legend>
          <Lista nombre="c_categoria" valor={r?.cond.categoria_id} vacio="es de cualquier categoría" opciones={cats} />
          <Lista nombre="c_organizacion" valor={r?.cond.organizacion_id} vacio="es de cualquier organización" opciones={orgs} />
          <Lista nombre="c_sector" valor={r?.cond.sector_id} vacio="va a cualquier sector" opciones={sectores} />
          <Lista nombre="c_canal" valor={r?.cond.canal} vacio="entra por cualquier canal" opciones={CANALES} />
          <input name="c_contiene" defaultValue={r?.cond.contiene} placeholder="y contiene alguna de estas palabras (separadas por coma)" className="campo" />
        </fieldset>
        <fieldset className="space-y-2 rounded-lg bg-canvas p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink/50">Entonces…</legend>
          <Lista nombre="prioridad" valor={r?.acc.prioridad} vacio="no cambiar la prioridad" opciones={PRIORIDADES.map((p) => ({ id: p.valor, nombre: `Prioridad ${p.etiqueta.toLowerCase()}` }))} />
          <Lista nombre="a_sector" valor={r?.acc.sector_id} vacio="no cambiar el sector" opciones={sectores.map((s) => ({ id: s.id, nombre: `Enviar a ${s.nombre}` }))} />
          <Lista nombre="a_asignado" valor={r?.acc.asignado_id} vacio="no asignar a nadie en particular" opciones={agentes.map((a) => ({ id: a.id, nombre: `Asignar a ${a.nombre}` }))} />
          <input name="a_avisar" type="email" defaultValue={r?.acc.avisar_email} placeholder="avisar por mail a…" className="campo" />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="a_confidencial" defaultChecked={r?.acc.confidencial} className="accent-brand-600" /> Marcarlo como confidencial
          </label>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {r && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="activo" defaultChecked={r.activo} className="accent-brand-600" /> Activa
          </label>
        )}
        <button className={r ? 'btn-sec' : 'btn'}>{r ? 'Guardar' : 'Agregar regla'}</button>
        {r && (
          <button formAction={eliminarRegla.bind(null, r.id)} className="text-xs text-ink/50 hover:text-red-700">Eliminar</button>
        )}
      </div>
    </form>
  )
}

export default async function Reglas() {
  const { db } = await exigirAdmin()
  const [rr, rc, ro, rs, rp] = await Promise.all([
    db.from('reglas').select('*').order('orden'),
    db.from('categorias').select('id,nombre').order('orden'),
    db.from('organizaciones').select('id,nombre').order('nombre'),
    db.from('sectores').select('id,nombre').eq('activo', true).order('orden'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']).eq('activo', true).order('nombre'),
  ])
  const reglas = (rr.data ?? []) as Regla[]
  const comun = {
    cats: (rc.data ?? []) as Opcion[],
    orgs: (ro.data ?? []) as Opcion[],
    sectores: (rs.data ?? []) as Opcion[],
    agentes: (rp.data ?? []).map((a) => ({ id: a.id as string, nombre: (a.nombre || a.email) as string })),
  }
  return (
    <div className="space-y-5">
      <div>
        <h1>Reglas automáticas</h1>
        <p className="text-sm text-ink/60">
          Se aplican cuando entra un ticket, en orden. Una regla se cumple cuando se cumplen todas las condiciones que tenga cargadas; necesita al menos una. Si dos reglas cambian lo mismo, gana la de mayor orden.
        </p>
      </div>
      {reglas.map((r) => (
        <Formulario key={r.id} r={r} orden={r.orden} {...comun} />
      ))}
      <Formulario orden={reglas.length + 1} {...comun} />
    </div>
  )
}
