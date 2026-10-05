import { APP_NOMBRE } from '@/lib/formato'
import Formulario from './formulario'

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-marca">Soporte</p>
          <h1>{APP_NOMBRE}</h1>
          <p className="mt-1 text-sm text-black/60">Ingresá para cargar un pedido o seguir los que ya tenés.</p>
        </div>
        {error === 'perfil' && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Tu cuenta existe pero no tiene perfil. Avisale al administrador: falta ejecutar el esquema de la base.
          </p>
        )}
        {error === 'acceso' && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo completar el ingreso. Probá de nuevo.</p>
        )}
        <div className="tarjeta p-5">
          <Formulario microsoft={process.env.NEXT_PUBLIC_MICROSOFT === '1'} />
        </div>
      </div>
    </main>
  )
}
