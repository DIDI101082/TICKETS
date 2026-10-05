import { exigirAdmin } from '@/lib/auth'
import { PRIORIDADES, type Campo, type Categoria, type Sector } from '@/lib/tipos'
import { guardarCategoria } from '../acciones'

const aTexto = (campos: Campo[]) =>
  (campos ?? []).map((c) => [c.etiqueta, c.tipo, c.opciones.join(', '), c.requerido ? 'obligatorio' : ''].join(' | ').replace(/(\s\|\s)+$/, '')).join('\n')

function Formulario({ c, sectores, orden }: { c?: Categoria; sectores: Sector[]; orden: number }) {
  return (
    <form action={guardarCategoria.bind(null, c?.id ?? null)} className={`space-y-3 p-4 ${c ? 'tarjeta' : 'rounded-xl border border-dashed border-line/20'}`}>
      {!c && <h2>Nueva categoría</h2>}
      <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
        <div>
          <label className="rotulo">Nombre</label>
          <input name="nombre" required defaultValue={c?.nombre} className="campo" />
        </div>
        <div>
          <label className="rotulo">Ayuda para quien carga el ticket</label>
          <input name="descripcion" defaultValue={c?.descripcion} className="campo" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="rotulo">Sector</label>
          <select name="sector_id" defaultValue={c?.sector_id ?? ''} className="campo">
            <option value="">Que lo decida la IA</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Prioridad</label>
          <select name="prioridad" defaultValue={c?.prioridad ?? ''} className="campo">
            <option value="">Que la decida la IA</option>
            {PRIORIDADES.map((p) => (
              <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Orden</label>
          <input name="orden" type="number" defaultValue={c?.orden ?? orden} className="campo" />
        </div>
      </div>
      <div>
        <label className="rotulo">Campos del formulario</label>
        <textarea name="campos" rows={4} defaultValue={c ? aTexto(c.campos) : ''} className="campo font-mono text-[13px]" placeholder={'Sistema o servicio | texto | | obligatorio\n¿A cuántos afecta? | lista | Solo a mí, A mi equipo | obligatorio\nDetalle | párrafo'} />
        <p className="mt-1 text-xs text-ink/45">Un campo por línea: Etiqueta | tipo (texto, párrafo o lista) | opciones separadas por coma | obligatorio</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="requiere_aprobacion" defaultChecked={c?.requiere_aprobacion} className="accent-brand-600" /> Requiere aprobación
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="confidencial" defaultChecked={c?.confidencial} className="accent-brand-600" /> Confidencial
        </label>
        {c && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="activo" defaultChecked={c.activo} className="accent-brand-600" /> Activa
          </label>
        )}
        <button className={c ? 'btn-sec' : 'btn'}>{c ? 'Guardar' : 'Agregar categoría'}</button>
      </div>
    </form>
  )
}

export default async function Categorias() {
  const { db } = await exigirAdmin()
  const [rc, rs] = await Promise.all([db.from('categorias').select('*').order('orden').order('nombre'), db.from('sectores').select('*').eq('activo', true).order('orden')])
  const categorias = (rc.data ?? []) as Categoria[]
  const sectores = (rs.data ?? []) as Sector[]
  return (
    <div className="space-y-5">
      <div>
        <h1>Categorías y formularios</h1>
        <p className="text-sm text-ink/60">
          Los tipos de pedido que elige la persona al cargar un ticket. Cada uno puede pedir datos propios, ir directo a un sector, exigir aprobación o ser confidencial.
        </p>
      </div>
      {categorias.map((c) => (
        <Formulario key={c.id} c={c} sectores={sectores} orden={c.orden} />
      ))}
      <Formulario sectores={sectores} orden={categorias.length + 1} />
    </div>
  )
}
