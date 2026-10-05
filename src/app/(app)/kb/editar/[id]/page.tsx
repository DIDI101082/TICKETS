import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirStaff } from '@/lib/auth'
import type { Articulo } from '@/lib/tipos'
import { eliminarArticulo, guardarArticulo } from '../../acciones'

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await exigirStaff()
  const nuevo = id === 'nuevo'

  let a: Articulo | null = null
  if (!nuevo) {
    const { data } = await db.from('articulos').select('*').eq('id', id).maybeSingle()
    if (!data) notFound()
    a = data as Articulo
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={a ? `/kb/${a.id}` : '/kb'} className="text-sm text-ink/50 hover:text-ink">
        ← Volver
      </Link>
      <h1>{nuevo ? 'Nuevo artículo' : 'Editar artículo'}</h1>

      <form action={guardarArticulo.bind(null, a?.id ?? null)} className="tarjeta space-y-4 p-5">
        <div>
          <label className="rotulo" htmlFor="titulo">Título</label>
          <input id="titulo" name="titulo" required maxLength={200} defaultValue={a?.titulo} className="campo" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="categoria">Categoría</label>
            <input id="categoria" name="categoria" defaultValue={a?.categoria ?? 'General'} className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="visibilidad">Quién lo ve</label>
            <select id="visibilidad" name="visibilidad" defaultValue={a?.visibilidad ?? 'todos'} className="campo">
              <option value="todos">Todos (internos y clientes)</option>
              <option value="internos">Solo usuarios internos</option>
              <option value="staff">Solo el equipo de soporte</option>
            </select>
          </div>
        </div>
        <div>
          <label className="rotulo" htmlFor="contenido">Contenido</label>
          <textarea id="contenido" name="contenido" rows={16} defaultValue={a?.contenido} className="campo font-mono text-[13px]" />
          <p className="mt-1 text-xs text-ink/45">
            Formato simple: # Título, ## Subtítulo, - viñetas, 1. pasos numerados, **negrita**, [texto](https://enlace).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="publicado" defaultChecked={a?.publicado ?? false} className="accent-brand-600" />
          Publicado (si no, queda como borrador visible solo para el equipo)
        </label>
        <button className="btn">Guardar</button>
      </form>

      {a && (
        <form action={eliminarArticulo.bind(null, a.id)}>
          <button className="text-sm text-red-700 underline-offset-2 hover:underline">Eliminar artículo</button>
        </form>
      )}
    </div>
  )
}
