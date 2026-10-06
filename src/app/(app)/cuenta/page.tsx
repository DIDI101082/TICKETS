import { sesion } from '@/lib/auth'
import { guardarCuenta } from '../acciones'

const ROL: Record<string, string> = { admin: 'Administrador', agente: 'Agente', usuario: 'Usuario' }

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams
  const { perfil } = await sesion()
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1>Mi cuenta</h1>
        <p className="text-sm text-ink/60">{perfil.email} · {ROL[perfil.rol]}</p>
      </div>
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">Guardamos los cambios.</p>}
      <form action={guardarCuenta} className="tarjeta space-y-4 p-5">
        <div>
          <label className="rotulo" htmlFor="nombre">Nombre y apellido</label>
          <input id="nombre" name="nombre" defaultValue={perfil.nombre} maxLength={80} className="campo" />
        </div>
        <fieldset className="space-y-2">
          <legend className="rotulo">Avisos por mail sobre mis pedidos</legend>
          {[
            ['todo', 'Cada novedad', 'Respuestas, cambios y resolución.'],
            ['resuelto', 'Solo cuando se resuelve', 'Las respuestas las ves en la campanita de la app.'],
            ['nada', 'Ninguno', 'Todo queda solo en la campanita.'],
          ].map(([valor, titulo, ayuda]) => (
            <label key={valor} className="flex items-start gap-2 text-sm">
              <input type="radio" name="avisos_mail" value={valor} defaultChecked={(perfil.avisos_mail ?? 'todo') === valor} className="mt-0.5 accent-brand-600" />
              <span>
                <span className="font-medium">{titulo}</span>
                <span className="block text-ink/55">{ayuda}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-ink/45">Los pedidos de aprobación te llegan siempre por mail, porque necesitan tu decisión.</p>
        </fieldset>
        <button className="btn">Guardar</button>
      </form>
    </div>
  )
}
