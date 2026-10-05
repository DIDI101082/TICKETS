import { exigirAdmin } from '@/lib/auth'
import { PRIORIDADES, type Sector } from '@/lib/tipos'
import { eliminarProgramado, guardarProgramado } from '../acciones'

interface Programado {
  id: string
  asunto: string
  descripcion: string
  sector_id: string | null
  prioridad: string
  frecuencia: string
  proxima: string
  ultima: string | null
  activo: boolean
}

function Formulario({ p, sectores }: { p?: Programado; sectores: Sector[] }) {
  return (
    <form action={guardarProgramado.bind(null, p?.id ?? null)} className={`space-y-3 p-4 ${p ? 'tarjeta' : 'rounded-xl border border-dashed border-line/20'}`}>
      {!p && <h2>Nueva tarea programada</h2>}
      <div>
        <label className="rotulo">Asunto del ticket</label>
        <input name="asunto" required defaultValue={p?.asunto} className="campo" placeholder="Ej.: Revisar el resultado de los backups" />
      </div>
      <div>
        <label className="rotulo">Detalle</label>
        <textarea name="descripcion" rows={2} defaultValue={p?.descripcion} className="campo" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="rotulo">Sector</label>
          <select name="sector_id" defaultValue={p?.sector_id ?? ''} className="campo">
            <option value="">Triage</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Prioridad</label>
          <select name="prioridad" defaultValue={p?.prioridad ?? 'media'} className="campo">
            {PRIORIDADES.map((x) => (
              <option key={x.valor} value={x.valor}>{x.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Se repite</label>
          <select name="frecuencia" defaultValue={p?.frecuencia ?? 'semanal'} className="campo">
            <option value="diaria">Todos los días</option>
            <option value="semanal">Cada semana</option>
            <option value="mensual">Cada mes</option>
          </select>
        </div>
        <div>
          <label className="rotulo">Próxima fecha</label>
          <input type="date" name="proxima" required defaultValue={p?.proxima} className="campo" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {p && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="activo" defaultChecked={p.activo} className="accent-brand-600" /> Activa
          </label>
        )}
        <button className={p ? 'btn-sec' : 'btn'}>{p ? 'Guardar' : 'Agregar'}</button>
        {p?.ultima && <span className="text-ink/50">Último ticket creado el {p.ultima.split('-').reverse().join('/')}</span>}
      </div>
    </form>
  )
}

export default async function Programados() {
  const { db } = await exigirAdmin()
  const [rp, rs] = await Promise.all([db.from('programados').select('*').order('proxima'), db.from('sectores').select('*').eq('activo', true).order('orden')])
  const lista = (rp.data ?? []) as Programado[]
  const sectores = (rs.data ?? []) as Sector[]
  return (
    <div className="space-y-5">
      <div>
        <h1>Tickets programados</h1>
        <p className="text-sm text-ink/60">
          Tareas que se repiten: el sistema crea el ticket solo en la fecha indicada y calcula la siguiente. Se revisa una vez por día y cada vez que alguien abre la bandeja.
        </p>
      </div>
      {lista.map((p) => (
        <div key={p.id} className="space-y-1">
          <Formulario p={p} sectores={sectores} />
          <form action={eliminarProgramado.bind(null, p.id)} className="text-right">
            <button className="text-xs text-ink/50 hover:text-red-700">Eliminar esta tarea</button>
          </form>
        </div>
      ))}
      <Formulario sectores={sectores} />
    </div>
  )
}
