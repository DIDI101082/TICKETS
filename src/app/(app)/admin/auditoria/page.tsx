import { exigirAdmin } from '@/lib/auth'
import { fecha } from '@/lib/formato'

interface Registro {
  id: number
  creado_en: string
  actor_nombre: string
  accion: string
  entidad: string
  entidad_id: string
  detalle: string
}

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ q?: string; vistas?: string }> }) {
  const sp = await searchParams
  const { db } = await exigirAdmin()
  const busca = (sp.q ?? '').replace(/[,()%*\\]/g, ' ').trim()

  let q = db.from('auditoria').select('*').order('creado_en', { ascending: false }).limit(500)
  if (sp.vistas !== '1') q = q.neq('accion', 'Vio ticket')
  if (busca) q = q.or(`actor_nombre.ilike.%${busca}%,accion.ilike.%${busca}%,entidad_id.ilike.%${busca}%,detalle.ilike.%${busca}%`)
  const { data } = await q
  const registros = (data ?? []) as Registro[]
  const params = new URLSearchParams({ ...(busca ? { q: busca } : {}), ...(sp.vistas === '1' ? { vistas: '1' } : {}) })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Auditoría</h1>
          <p className="text-sm text-ink/60">Quién cambió qué, y quién abrió cada ticket. Se muestran los últimos 500 registros.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={busca} placeholder="Persona, acción o #ticket" className="campo w-56" />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="vistas" value="1" defaultChecked={sp.vistas === '1'} className="accent-brand-600" /> Incluir aperturas de tickets
          </label>
          <button className="btn-sec">Filtrar</button>
          <a href={`/api/export/auditoria?${params}`} className="btn-sec">Exportar (CSV)</a>
        </form>
      </div>
      {registros.length === 0 ? (
        <p className="tarjeta p-8 text-center text-sm text-ink/60">No hay registros con ese filtro.</p>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Persona</th>
                <th>Acción</th>
                <th>Sobre</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-ink/60">{fecha(r.creado_en)}</td>
                  <td>{r.actor_nombre}</td>
                  <td className="font-medium">{r.accion}</td>
                  <td className="text-ink/70">{r.entidad_id}</td>
                  <td className="max-w-md text-ink/70">{r.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
