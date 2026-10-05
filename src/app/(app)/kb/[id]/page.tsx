import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import Markdown from '@/components/Markdown'
import type { Articulo } from '@/lib/tipos'

export default async function Ver({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db, staff } = await sesion()
  const { data } = await db.from('articulos').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const a = data as Articulo

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/kb" className="text-sm text-black/50 hover:text-tinta">
        ← Volver
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-marca">{a.categoria}</p>
          <h1>{a.titulo}</h1>
          <p className="mt-1 text-xs text-black/45">Actualizado {fecha(a.actualizado_en)}</p>
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
      <p className="text-sm text-black/60">
        ¿No te resolvió el problema?{' '}
        <Link href="/portal/nuevo" className="text-marca underline">
          Cargá un ticket
        </Link>
        .
      </p>
    </div>
  )
}
