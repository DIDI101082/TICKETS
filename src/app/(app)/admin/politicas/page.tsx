import Link from 'next/link'
import { exigirAdmin } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { estadoPolitica, type Politica } from '@/lib/politicas'
import FormPolitica from './FormPolitica'

export default async function AdminPoliticas({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams
  const { db } = await exigirAdmin()
  const { data, error } = await db.from('politicas').select('*').order('publicada', { ascending: false }).order('titulo')
  const politicas = (data ?? []) as Politica[]
  const estados = await Promise.all(politicas.map((p) => (p.publicada ? estadoPolitica(p) : Promise.resolve(null))))

  return (
    <div className="space-y-6">
      <div>
        <h1>Políticas</h1>
        <p className="max-w-3xl text-sm text-ink/60">
          Políticas que las personas tienen que leer y aceptar (uso aceptable, contraseñas, escritorio limpio, teletrabajo…). Cada aceptación queda registrada
          con la persona, la fecha y la versión: es la evidencia de concientización para la auditoría ISO/IEC 27001. Si cambiás la versión, todos tienen que aceptarla de nuevo.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Falta ejecutar supabase/008_phishing_politicas_viajes.sql.</p>}
      {sp.error === 'titulo' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Poné un título.</p>}

      {politicas.length > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr><th>Política</th><th>Versión</th><th>Para</th><th>Estado</th><th>Aceptación</th></tr>
            </thead>
            <tbody>
              {politicas.map((p, i) => {
                const e = estados[i]
                const pct = e && e.total ? Math.round((e.aceptaron / e.total) * 100) : null
                return (
                  <tr key={p.id}>
                    <td><Link href={`/admin/politicas/${p.id}`} className="font-medium hover:text-brand-600 hover:underline">{p.titulo}</Link>{!p.obligatoria && <span className="pill ml-2 bg-ink/5 text-ink/55">Informativa</span>}</td>
                    <td className="text-ink/60">v{p.version}</td>
                    <td className="text-ink/60">{p.alcance === 'todos' ? 'Todos' : 'Internos'}</td>
                    <td>{p.publicada ? <span className="text-emerald-700">Publicada{p.publicada_en ? ` el ${fecha(p.publicada_en)}` : ''}</span> : <span className="text-ink/50">Borrador</span>}</td>
                    <td className="whitespace-nowrap">
                      {e ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-brand-600 dark:bg-brand-300" style={{ width: `${pct ?? 0}%` }} /></div>
                          <span className="tabular-nums text-ink/70">{e.aceptaron}/{e.total}</span>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-2">
        <h2>Nueva política</h2>
        <FormPolitica />
      </section>
    </div>
  )
}
