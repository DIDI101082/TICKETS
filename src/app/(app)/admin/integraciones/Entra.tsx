import { entraConfigurado, leerEntra } from '@/lib/entra'
import { fecha } from '@/lib/formato'
import { guardarEntra, sincronizarEntraAhora } from './entra-acciones'

// Personas desde Entra ID: estado, opciones y último resultado.

const ETIQUETAS: [string, string][] = [
  ['en_entra', 'personas en Entra'],
  ['vinculados', 'vinculadas ahora'],
  ['actualizados', 'con datos actualizados'],
  ['jefes', 'jefes asignados'],
  ['desactivados', 'desactivadas'],
  ['reactivados', 'reactivadas'],
  ['sin_ingresar', 'todavía no entraron a Desk'],
]

export default async function Entra({ aviso }: { aviso?: string }) {
  const conf = await leerEntra()
  const ok = entraConfigurado()
  const r = conf.resultado ?? {}
  const admins = (r.admins_sin_desactivar as string[] | undefined) ?? []

  return (
    <section id="entra" className="tarjeta space-y-4 p-4">
      <div>
        <h2>Personas desde Entra ID</h2>
        <p className="max-w-3xl text-sm text-ink/60">
          Desk toma de Microsoft 365 el nombre, el área, el puesto y el <strong>jefe</strong> de cada persona (con eso funcionan “Mi equipo” y las aprobaciones del jefe).
          Si una cuenta se deshabilita en Entra, se desactiva también acá. Quien todavía no entró a Desk se completa sola la primera vez que ingresa.
        </p>
      </div>
      {!ok && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Faltan <code>AZURE_TENANT_ID</code>, <code>AZURE_CLIENT_ID</code> y <code>AZURE_CLIENT_SECRET</code> en Vercel (la app de Entra necesita el permiso de aplicación <strong>User.Read.All</strong>).
        </p>
      )}
      {aviso === 'guardado' && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardamos la configuración.</p>}

      <form action={guardarEntra} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="activo" defaultChecked={conf.activo} className="accent-brand-600" /> Sincronizar automáticamente (cada hora)
        </label>
        <label className="flex items-center gap-2" title="Nunca se desactiva a un administrador: se avisa">
          <input type="checkbox" name="desactivar" defaultChecked={conf.desactivar} className="accent-brand-600" /> Desactivar en Desk las cuentas deshabilitadas o borradas en Entra
        </label>
        <button className="btn-sec">Guardar</button>
      </form>

      <div className="space-y-2 border-t border-line/10 pt-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink/65">
            Última sincronización: <strong className="text-ink">{conf.ultimo ? fecha(conf.ultimo) : 'todavía no corrió'}</strong>
          </p>
          <form action={sincronizarEntraAhora}>
            <button className="btn" disabled={!ok}>Sincronizar ahora</button>
          </form>
        </div>
        {conf.error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{conf.error}</p>
        ) : conf.resultado ? (
          <>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-ink/70">
              {ETIQUETAS.filter(([k]) => r[k] != null).map(([k, t]) => (
                <li key={k}><strong className="tabular-nums text-ink">{String(r[k])}</strong> {t}</li>
              ))}
            </ul>
            {admins.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                Estos administradores están deshabilitados en Entra y no se desactivaron solos (para no dejar a Desk sin administrador): {admins.join(', ')}. Revisalos en Personas.
              </p>
            )}
          </>
        ) : null}
      </div>
    </section>
  )
}
