import Link from 'next/link'
import { sesion } from '@/lib/auth'
import type { Articulo } from '@/lib/tipos'

export default async function Kb({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const { db, staff } = await sesion()

  // La seguridad por fila ya filtra lo que cada persona puede ver.
  const { data } = await db.from('articulos').select('*').order('categoria').order('titulo').limit(500)
  const palabras = q.toLowerCase().split(/\s+/).filter((p) => p.length > 2)
  const articulos = ((data ?? []) as Articulo[]).filter((a) => {
    if (!palabras.length) return true
    const texto = `${a.titulo} ${a.categoria} ${a.contenido}`.toLowerCase()
    return palabras.every((p) => texto.includes(p))
  })

  const categorias = [...new Set(articulos.map((a) => a.categoria))]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>{staff ? 'Base de conocimiento' : 'Ayuda'}</h1>
          <p className="text-sm text-ink/60">Guías y respuestas a los problemas más frecuentes.</p>
        </div>
        {staff && (
          <Link href="/kb/editar/nuevo" className="btn-sec">
            Nuevo artículo
          </Link>
        )}
      </div>

      <form className="flex max-w-xl gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar: VPN, contraseña, impresora…" className="campo" />
        <button className="btn-sec">Buscar</button>
      </form>

      {articulos.length === 0 ? (
        <p className="tarjeta p-8 text-center text-sm text-ink/60">
          {q ? 'No encontramos artículos con esa búsqueda.' : 'Todavía no hay artículos publicados.'}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {categorias.map((c) => (
            <section key={c} className="tarjeta p-4">
              <h2 className="mb-2">{c}</h2>
              <ul className="space-y-1.5 text-sm">
                {articulos
                  .filter((a) => a.categoria === c)
                  .map((a) => (
                    <li key={a.id} className="flex items-baseline gap-2">
                      <Link href={`/kb/${a.id}`} className="hover:text-brand-600 hover:underline">
                        {a.titulo}
                      </Link>
                      {staff && !a.publicado && <span className="pill bg-line/[0.05] text-ink/50">Borrador</span>}
                      {staff && a.publicado && a.visibilidad !== 'todos' && (
                        <span className="pill bg-amber-500/10 text-amber-700">{a.visibilidad === 'staff' ? 'Solo equipo' : 'Solo internos'}</span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
