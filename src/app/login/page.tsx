import Mark from '@/components/Mark'
import Formulario from './formulario'

// Mismo fondo azul y tarjeta translúcida que el ingreso de Accusys Cyber.
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-[#0A2A6E] bg-[radial-gradient(ellipse_at_top_left,#123C96_0%,transparent_55%),linear-gradient(135deg,#0A2466_0%,#0B3A9E_55%,#1449C8_100%)] px-6 py-10 text-white">
      <main className="w-full max-w-md rounded-2xl border border-white/20 bg-white/[0.08] px-8 py-9 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="flex items-center justify-center gap-4">
          <span className="[&_img]:brightness-0 [&_img]:invert">
            <Mark className="h-9" />
          </span>
          <span className="h-9 w-px bg-white/35" aria-hidden />
          <span className="font-display text-[26px] font-extrabold leading-none tracking-tight">Tickets</span>
        </div>

        <h1 className="mt-8 text-center !text-xl !text-white">Bienvenido</h1>
        <p className="mt-1.5 text-center text-sm text-white/70">Ingresá para cargar un pedido o seguir los que ya tenés</p>

        {error === 'perfil' && (
          <p className="mt-5 rounded-lg bg-white/15 px-3 py-2 text-center text-sm" role="status">
            Tu cuenta existe pero no tiene perfil. Avisale al administrador: falta ejecutar el esquema de la base.
          </p>
        )}
        {error === 'acceso' && (
          <p className="mt-5 rounded-lg border border-red-300/30 bg-red-500/25 px-3 py-2 text-sm text-red-100" role="alert">
            No se pudo completar el ingreso. Probá de nuevo.
          </p>
        )}

        <div className="mt-6">
          <Formulario microsoft={process.env.NEXT_PUBLIC_MICROSOFT === '1'} />
        </div>
      </main>
      <p className="mt-6 text-xs text-white/50">© {new Date().getFullYear()} Accusys. Todos los derechos reservados.</p>
    </div>
  )
}
