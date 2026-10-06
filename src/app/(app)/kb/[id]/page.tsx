import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import Markdown from '@/components/Markdown'
import type { Articulo } from '@/lib/tipos'
import { votarArticulo } from '../../acciones'

export default async function Ver({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db, staff, perfil } = await sesion()
  const { data } = await db.from('articulos').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const a = data as Articulo
  // La base devuelve solo el voto propio; al equipo le devuelve todos.
  const { data: votos } = await db.from('articulo_votos').select('perfil_id,util').eq('articulo_id', id)
  const mio = (votos ?? []).find((v) => v.perfil_id === perfil.id)
  const si = (votos ?? []).filter((v) => v.util).length
  const no = (votos ?? []).length - si

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/kb" className="text-sm text-ink/50 hover:text-ink">
        ← Volver
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">{a.categoria}</p>
          <h1>{a.titulo}</h1>
          <p className="mt-1 text-xs text-ink/45">Actualizado {fecha(a.actualizado_en)}</p>
        </div>
        {staff && (
          <Link href={`/kb/editar/${a.id}`} className="btn-sec">
            Editar
          </Link>
        )}
      </div>
      <article className="tarjeta p-5">
        <Markdown texto={a.contenido} />
      </article>
      <div className="tarjeta flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="font-medium">¿Te sirvió este artículo?</span>
        <form action={votarArticulo.bind(null, a.id, true)}>
          <button className={mio?.util === true ? 'btn px-3 py-1.5' : 'btn-sec px-3 py-1.5'}>Sí</button>
        </form>
        <form action={votarArticulo.bind(null, a.id, false)}>
          <button className={mio?.util === false ? 'btn px-3 py-1.5' : 'btn-sec px-3 py-1.5'}>No</button>
        </form>
        {mio && <span className="text-ink/55">Gracias por avisarnos.</span>}
        {staff && <span className="ml-auto text-ink/55">{si} dijeron que sí · {no} que no</span>}
      </div>
      <p className="text-sm text-ink/60">
        ¿No te resolvió el problema?{' '}
        <Link href="/portal/nuevo" className="text-brand-600 underline">
          Cargá un ticket
        </Link>
        .
      </p>
    </div>
  )
}
