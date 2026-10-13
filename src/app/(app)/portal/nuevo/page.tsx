import Link from 'next/link'
import { sesion } from '@/lib/auth'
import type { Categoria, Servicio, Ticket } from '@/lib/tipos'
import Formulario, { type Inicial } from './formulario'

export default async function Nuevo({ searchParams }: { searchParams: Promise<{ cat?: string; desde?: string; para?: string; equipo?: string }> }) {
  const sp = await searchParams
  const { db, staff } = await sesion()
  const enNombre = staff && sp.para === 'otro'
  const [rc, rs] = await Promise.all([
    db.from('categorias').select('*').eq('activo', true).order('orden').order('nombre'),
    db.from('servicios').select('*').neq('estado', 'operativo').order('orden'),
  ])
  const categorias = (rc.data ?? []) as Categoria[]
  const conProblemas = (rs.data ?? []) as Servicio[]

  // "Cargar otro pedido igual": se parte de un ticket que la persona puede ver.
  let inicial: Inicial | null = null
  if (sp.desde) {
    const { data } = await db.from('tickets').select('*').eq('id', sp.desde).maybeSingle()
    const t = data as Ticket | null
    if (t) {
      inicial = {
        categoriaId: categorias.some((c) => c.id === t.categoria_id) ? t.categoria_id ?? '' : '',
        asunto: t.asunto,
        descripcion: t.descripcion,
        datos: Object.fromEntries((t.datos ?? []).map((d) => [d.etiqueta, d.valor])),
      }
    }
  } else if (sp.cat && categorias.some((c) => c.id === sp.cat)) {
    // Desde "Mi espacio": el equipo ya viene cargado en el campo de equipo / n.º de inventario de la categoría
    const campoEquipo = categorias.find((c) => c.id === sp.cat)?.campos?.find((c) => /equipo|inventario/i.test(c.etiqueta))
    const equipo = (sp.equipo ?? '').slice(0, 80)
    inicial = { categoriaId: sp.cat, asunto: '', descripcion: '', datos: campoEquipo && equipo ? { [campoEquipo.etiqueta]: equipo } : {} }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1>{enNombre ? 'Nuevo ticket para otra persona' : 'Nuevo ticket'}</h1>
        <p className="text-sm text-ink/60">Elegí el tipo de pedido y describí el problema con el mayor detalle posible.</p>
      </div>
      {conProblemas.length > 0 && (
        <Link href="/estado" className="block rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Ya estamos al tanto de un problema en:</strong> {conProblemas.map((s) => s.nombre).join(', ')}. Si tu pedido es por eso, no hace falta cargarlo. Ver el estado →
        </Link>
      )}
      <Formulario categorias={categorias} inicial={inicial} enNombre={enNombre} />
    </div>
  )
}
