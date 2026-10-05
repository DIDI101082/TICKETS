import { sesion } from '@/lib/auth'
import Formulario from './formulario'

export default async function Nuevo() {
  await sesion()
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1>Nuevo ticket</h1>
        <p className="text-sm text-black/60">
          Describí el problema con el mayor detalle posible. Lo derivamos automáticamente al sector que corresponde.
        </p>
      </div>
      <Formulario />
    </div>
  )
}
