import type { Politica } from '@/lib/politicas'
import { guardarPolitica } from './acciones'

export default function FormPolitica({ p }: { p?: Politica }) {
  return (
    <form action={guardarPolitica.bind(null, p?.id ?? null)} className={`space-y-3 p-4 ${p ? 'tarjeta' : 'rounded-xl border border-dashed border-line/20'}`}>
      <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
        <div>
          <label className="rotulo">Título</label>
          <input name="titulo" required maxLength={150} defaultValue={p?.titulo} className="campo" placeholder="Política de uso aceptable" />
        </div>
        <div>
          <label className="rotulo">Versión</label>
          <input name="version" maxLength={20} defaultValue={p?.version ?? '1.0'} className="campo" />
        </div>
      </div>
      <div>
        <label className="rotulo">En pocas palabras</label>
        <textarea name="resumen" rows={2} maxLength={600} defaultValue={p?.resumen} className="campo" placeholder="Qué pide la política, en dos o tres líneas que cualquiera entienda." />
      </div>
      <div>
        <label className="rotulo">Texto</label>
        <textarea name="contenido" rows={10} defaultValue={p?.contenido} className="campo font-mono text-[13px]" placeholder={'## Objetivo\n...\n\n## Qué se espera de cada persona\n- ...'} />
        <p className="mt-1 text-xs text-ink/45">Admite títulos (##), listas con guion, **negrita** y [enlaces](https://…). Si el texto oficial está en otro lado, dejá un resumen y cargá el enlace.</p>
      </div>
      <div>
        <label className="rotulo">Documento completo (opcional)</label>
        <input name="enlace" type="url" defaultValue={p?.enlace ?? ''} className="campo" placeholder="https://… (SharePoint, PDF)" />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          Para
          <select name="alcance" defaultValue={p?.alcance ?? 'internos'} className="campo w-auto py-1">
            <option value="internos">Personal interno</option>
            <option value="todos">Todos (también externos)</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="obligatoria" defaultChecked={p?.obligatoria ?? true} className="accent-brand-600" /> Hay que aceptarla
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="publicada" defaultChecked={p?.publicada} className="accent-brand-600" /> Publicada
        </label>
        <button className={p ? 'btn-sec' : 'btn'}>{p ? 'Guardar' : 'Crear política'}</button>
      </div>
      {p && <p className="text-xs text-ink/45">Cambiar la versión pide aceptarla de nuevo a todos. Para corregir una errata sin pedir nada, dejá la misma versión.</p>}
    </form>
  )
}
