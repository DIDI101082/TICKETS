import { exigirAdmin } from '@/lib/auth'
import type { Organizacion } from '@/lib/tipos'
import { guardarOrganizacion } from '../acciones'

export default async function Organizaciones() {
  const { db } = await exigirAdmin()
  const [ro, rp] = await Promise.all([db.from('organizaciones').select('*').order('nombre'), db.from('perfiles').select('organizacion_id')])
  const orgs = (ro.data ?? []) as Organizacion[]
  const personas = (id: string) => (rp.data ?? []).filter((p) => p.organizacion_id === id).length
  return (
    <div className="space-y-5">
      <div>
        <h1>Organizaciones</h1>
        <p className="text-sm text-ink/60">
          Las empresas clientes. Quien se registra con un mail de uno de sus dominios queda asociado automáticamente; también se puede asignar a mano en Personas.
        </p>
      </div>
      <div className="space-y-2">
        {orgs.map((o) => (
          <form key={o.id} action={guardarOrganizacion.bind(null, o.id)} className="tarjeta grid gap-3 p-3 md:grid-cols-[16rem_1fr_7rem_auto_auto] md:items-center">
            <input name="nombre" required defaultValue={o.nombre} className="campo" aria-label="Nombre" />
            <input name="dominios" defaultValue={o.dominios} placeholder="cliente.com, cliente.com.ar" className="campo" aria-label="Dominios" />
            <span className="text-sm text-ink/55">{personas(o.id)} personas</span>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="activo" defaultChecked={o.activo} className="accent-brand-600" /> Activa
            </label>
            <button className="btn-sec">Guardar</button>
          </form>
        ))}
        <form action={guardarOrganizacion.bind(null, null)} className="grid gap-3 rounded-xl border border-dashed border-line/20 p-3 md:grid-cols-[16rem_1fr_auto] md:items-center">
          <input name="nombre" required placeholder="Nueva organización" className="campo" />
          <input name="dominios" placeholder="Dominios de mail, separados por coma" className="campo" />
          <button className="btn">Agregar</button>
        </form>
      </div>
    </div>
  )
}
