import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { politicasDe } from '@/lib/politicas'

export default async function Politicas({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams
  const { db, perfil, esAdmin } = await sesion()
  const { lista, pendientes, error } = await politicasDe(db, perfil)
  const resto = lista.filter((p) => !pendientes.includes(p))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Políticas</h1>
          <p className="text-sm text-ink/60">Las reglas de seguridad y de uso de la empresa. Leelas y confirmá que las aceptás: queda registrado con la fecha y la versión.</p>
        </div>
        {esAdmin && <Link href="/admin/politicas" className="btn-sec">Administrar</Link>}
      </div>
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">¡Gracias! Registramos que aceptaste “{ok}”.</p>}
      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Las políticas todavía no están disponibles.</p>}

      {pendientes.length > 0 && (
        <section className="space-y-2">
          <h2>Para leer y aceptar ({pendientes.length})</h2>
          <ul className="space-y-2">
            {pendientes.map((p) => (
              <li key={p.id}>
                <Link href={`/politicas/${p.id}`} className="tarjeta block border-amber-300 p-4 transition hover:border-brand-500">
                  <p className="font-medium">{p.titulo} <span className="text-xs font-normal text-ink/50">v{p.version}</span></p>
                  {p.aceptoAnterior && <p className="text-xs text-amber-700">Se actualizó: hay que aceptar la versión nueva.</p>}
                  {p.resumen && <p className="mt-0.5 text-sm text-ink/60">{p.resumen}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!error && lista.length === 0 && <p className="tarjeta p-6 text-center text-sm text-ink/60">No hay políticas publicadas por ahora.</p>}

      {resto.length > 0 && (
        <section className="space-y-2">
          <h2>{pendientes.length ? 'Las demás' : 'Todas al día'}</h2>
          <ul className="tarjeta divide-y divide-line/[0.06]">
            {resto.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <Link href={`/politicas/${p.id}`} className="font-medium hover:text-brand-600 hover:underline">{p.titulo} <span className="text-xs font-normal text-ink/50">v{p.version}</span></Link>
                <span className={p.aceptada_en ? 'text-emerald-700' : 'text-ink/50'}>{p.aceptada_en ? `✓ Aceptada el ${fecha(p.aceptada_en)}` : 'Para consulta'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
