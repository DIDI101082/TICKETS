import { sesion } from '@/lib/auth'
import type { Categoria } from '@/lib/tipos'
import Formulario from './formulario'

export default async function Nuevo() {
  const { db } = await sesion()
  const { data } = await db.from('categorias').select('*').eq('activo', true).order('orden').order('nombre')
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1>Nuevo ticket</h1>
        <p className="text-sm text-ink/60">Elegí el tipo de pedido y describí el problema con el mayor detalle posible.</p>
      </div>
      <Formulario categorias={(data ?? []) as Categoria[]} />
    </div>
  )
}
