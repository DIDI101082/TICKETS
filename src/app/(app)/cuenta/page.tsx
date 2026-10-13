import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import type { Acceso } from '@/lib/tipos'
import { guardarCuenta } from '../acciones'

const ROL: Record<string, string> = { admin: 'Administrador', agente: 'Agente', usuario: 'Usuario' }

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams
  const { perfil, db } = await sesion()
  // Accesos otorgados a esta persona (si todavía no se ejecutó 006_accesos_y_conocimiento.sql, la lista queda vacía)
  const { data: racc } = await db.from('accesos').select('*').eq('persona_id', perfil.id).neq('estado', 'revocado').order('hasta', { ascending: true, nullsFirst: false })
  const misAccesos = (racc ?? []) as Acceso[]
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1>Mi cuenta</h1>
        <p className="text-sm text-ink/60">{perfil.email} · {ROL[perfil.rol]} · <Link href="/mi-espacio" className="text-brand-600 hover:underline">Mis equipos, accesos y licencias</Link></p>
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
        {perfil.rol !== 'usuario' && (
          <div>
            <label className="rotulo" htmlFor="ausente_hasta">Estoy ausente hasta</label>
            <input id="ausente_hasta" name="ausente_hasta" type="date" defaultValue={perfil.ausente_hasta ?? ''} className="campo w-auto" />
            <p className="mt-1 text-xs text-ink/45">Mientras tanto no recibís tickets por reparto automático. Dejalo vacío cuando vuelvas.</p>
          </div>
        )}
        <button className="btn">Guardar</button>
      </form>

      {misAccesos.length > 0 && (
        <div className="tarjeta space-y-2 p-5 text-sm">
          <h2>Mis accesos</h2>
          <p className="text-ink/60">Accesos que se te otorgaron por un pedido. Te avisamos unos días antes de que venzan.</p>
          <ul className="divide-y divide-line/[0.06]">
            {misAccesos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <span>
                  {a.sistema}
                  {a.ticket_id && <Link href={`/tickets/${a.ticket_id}`} className="ml-2 text-xs text-brand-600 hover:underline">ver pedido</Link>}
                </span>
                <span className="text-ink/60">
                  {a.estado === 'revocacion_pendiente' ? 'Se está quitando' : a.hasta ? `Vence el ${fecha(a.hasta)}` : 'Sin fecha de fin'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
