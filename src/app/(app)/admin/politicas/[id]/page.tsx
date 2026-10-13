import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirAdmin } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { estadoPolitica, type Politica } from '@/lib/politicas'
import FormPolitica from '../FormPolitica'
import { avisarFaltantes } from '../acciones'

export default async function EditarPolitica({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; avisados?: string; ver?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const { db } = await exigirAdmin()
  const { data } = await db.from('politicas').select('*').eq('id', id).maybeSingle()
  const p = data as Politica | null
  if (!p) notFound()
  const e = p.publicada ? await estadoPolitica(p) : null
  const faltan = e?.personas.filter((x) => !x.aceptada_en) ?? []
  const lista = sp.ver === 'todas' ? e?.personas ?? [] : faltan

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/politicas" className="text-sm text-ink/55 hover:text-ink">← Políticas</Link>
          <h1>{p.titulo}</h1>
        </div>
        <Link href={`/politicas/${p.id}`} className="btn-sec">Ver como la ve la gente</Link>
      </div>
      {sp.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">Guardamos los cambios.</p>}
      {sp.avisados != null && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">Enviamos {sp.avisados} mails.</p>}

      {e && (
        <section className="tarjeta space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Aceptación de la versión {p.version}: {e.aceptaron} de {e.total} ({e.total ? Math.round((e.aceptaron / e.total) * 100) : 0}%)</h2>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/export/politicas?id=${p.id}`} className="btn-sec">Exportar evidencia (CSV)</a>
              {faltan.length > 0 && (
                <form action={avisarFaltantes.bind(null, p.id)}>
                  <button className="btn">Avisar por mail a quienes faltan ({faltan.length})</button>
                </form>
              )}
            </div>
          </div>
          <nav className="flex gap-1 text-sm">
            <Link href={`/admin/politicas/${p.id}`} className={`rounded-md px-3 py-1 ${sp.ver !== 'todas' ? 'bg-brand-50 text-brand-700' : 'text-ink/60'}`}>Faltan ({faltan.length})</Link>
            <Link href={`/admin/politicas/${p.id}?ver=todas`} className={`rounded-md px-3 py-1 ${sp.ver === 'todas' ? 'bg-brand-50 text-brand-700' : 'text-ink/60'}`}>Todas ({e.total})</Link>
          </nav>
          {lista.length === 0 ? (
            <p className="text-sm text-ink/60">{sp.ver === 'todas' ? 'No hay personas a las que les corresponda.' : 'Todos aceptaron la versión vigente. 🎉'}</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="tabla">
                <thead><tr><th>Persona</th><th>Organización</th><th>Aceptó</th></tr></thead>
                <tbody>
                  {lista.map((x) => (
                    <tr key={x.id}>
                      <td>{x.nombre || x.email}<div className="text-xs text-ink/50">{x.email}</div></td>
                      <td className="text-ink/60">{x.organizacion || '—'}</td>
                      <td className={x.aceptada_en ? 'text-emerald-700' : 'text-amber-700'}>{x.aceptada_en ? fecha(x.aceptada_en) : 'Pendiente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <FormPolitica p={p} />
    </div>
  )
}
