import Link from 'next/link'
import { exigirStaff } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { zonaTurnos, type Turno } from '@/lib/turnos'
import { enZona, fechaEnZona, horaEnZona, sumarDias, type Lugar } from '@/lib/turnos-calc'
import { cancelarTurnoStaff, marcarTurno } from '../acciones'

const ESTADO: Record<Turno['estado'], string> = {
  reservado: 'bg-brand-50 text-brand-700',
  atendido: 'bg-emerald-50 text-emerald-700',
  ausente: 'bg-amber-500/10 text-amber-700',
  cancelado: 'bg-ink/5 text-ink/50',
}
const TEXTO: Record<Turno['estado'], string> = { reservado: 'Reservado', atendido: 'Atendido', ausente: 'No vino', cancelado: 'Cancelado' }

export default async function Agenda({ searchParams }: { searchParams: Promise<{ dia?: string; lugar?: string }> }) {
  const sp = await searchParams
  const { perfil, esAdmin } = await exigirStaff()
  const zona = await zonaTurnos()
  const hoy = fechaEnZona(Date.now(), zona)
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? '') ? sp.dia! : hoy
  const desde = enZona(dia, '00:00', zona)
  const hasta = enZona(sumarDias(dia, 1), '00:00', zona)
  const db = admin()
  const [{ data: rl }, { data: rt }, { data: semana }] = await Promise.all([
    db.from('turno_lugares').select('*').order('orden').order('nombre'),
    db.from('turnos').select('*, tickets(numero)').gte('inicio', desde.toISOString()).lt('inicio', hasta.toISOString()).order('inicio'),
    db.from('turnos').select('inicio').eq('estado', 'reservado').gte('inicio', enZona(hoy, '00:00', zona).toISOString()).lt('inicio', enZona(sumarDias(hoy, 7), '00:00', zona).toISOString()),
  ])
  const lugares = (rl ?? []) as Lugar[]
  const turnos = ((rt ?? []) as (Turno & { tickets: { numero: number } | null })[]).filter((t) => !sp.lugar || t.lugar_id === sp.lugar)
  const ids = [...new Set(turnos.map((t) => t.tecnico_id).filter((x): x is string => !!x))]
  const { data: tecnicos } = ids.length ? await db.from('perfiles').select('id,nombre,email').in('id', ids) : { data: [] }
  const nombreDe = new Map((tecnicos ?? []).map((p) => [p.id as string, (p.nombre || p.email) as string]))
  const porDia = new Map<string, number>()
  for (const t of semana ?? []) porDia.set(fechaEnZona(t.inicio, zona), (porDia.get(fechaEnZona(t.inicio, zona)) ?? 0) + 1)
  const url = (d: string, l = sp.lugar) => `/turnos/agenda?dia=${d}${l ? `&lugar=${l}` : ''}`
  const titulo = new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Agenda de turnos</h1>
          <p className="text-sm capitalize text-ink/60">{titulo}{dia === hoy ? ' (hoy)' : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={url(sumarDias(dia, -1))} className="btn-sec">← Anterior</Link>
          {dia !== hoy && <Link href={url(hoy)} className="btn-sec">Hoy</Link>}
          <Link href={url(sumarDias(dia, 1))} className="btn-sec">Siguiente →</Link>
          {esAdmin && <Link href="/admin/turnos" className="text-brand-600 hover:underline">Horarios y lugares</Link>}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 text-sm">
        {Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i)).map((d) => (
          <Link key={d} href={url(d)} className={`rounded-md px-3 py-1.5 ${d === dia ? 'bg-brand-600 text-white' : 'bg-surface text-ink/70 hover:text-ink'}`}>
            <span className="capitalize">{new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric' })}</span>
            {porDia.get(d) ? <span className="ml-1 tabular-nums opacity-75">({porDia.get(d)})</span> : null}
          </Link>
        ))}
      </nav>
      <nav className="flex flex-wrap gap-1 text-sm">
        <Link href={`/turnos/agenda?dia=${dia}`} className={`rounded-md px-3 py-1 ${!sp.lugar ? 'bg-brand-50 text-brand-700' : 'text-ink/60'}`}>Todos los lugares</Link>
        {lugares.filter((l) => l.activo).map((l) => (
          <Link key={l.id} href={url(dia, l.id)} className={`rounded-md px-3 py-1 ${sp.lugar === l.id ? 'bg-brand-50 text-brand-700' : 'text-ink/60'}`}>{l.nombre}</Link>
        ))}
      </nav>

      {turnos.length === 0 ? (
        <p className="tarjeta p-6 text-center text-sm text-ink/60">No hay turnos para este día.</p>
      ) : (
        <ul className="space-y-2">
          {turnos.map((t) => {
            const lugar = lugares.find((l) => l.id === t.lugar_id)
            const volver = url(dia)
            return (
              <li key={t.id} className={`tarjeta grid gap-3 p-4 text-sm md:grid-cols-[6rem_1fr_auto] ${t.estado === 'cancelado' ? 'opacity-60' : ''}`}>
                <div>
                  <p className="font-display text-lg tabular-nums">{horaEnZona(t.inicio, zona)}</p>
                  <p className="text-xs text-ink/50">{lugar?.nombre}</p>
                </div>
                <div className="space-y-1">
                  <p>
                    <span className="font-medium">{t.persona_nombre || t.persona_email}</span>
                    <span className={`pill ml-2 ${ESTADO[t.estado]}`}>{TEXTO[t.estado]}</span>
                  </p>
                  <p className="text-ink/70">{t.motivo}{t.equipo ? ` · ${t.equipo}` : ''}</p>
                  {t.detalle && <p className="text-ink/60">“{t.detalle}”</p>}
                  <p className="text-xs text-ink/50">
                    {t.persona_email}
                    {t.ticket_id && <> · <Link href={`/tickets/${t.ticket_id}`} className="text-brand-600 hover:underline">Pedido #{t.tickets?.numero}</Link></>}
                    {t.tecnico_id && <> · Lo atiende {t.tecnico_id === perfil.id ? 'vos' : nombreDe.get(t.tecnico_id)}</>}
                  </p>
                  {t.nota_tecnico && <p className="text-xs text-ink/60">Nota: {t.nota_tecnico}</p>}
                </div>
                {t.estado !== 'cancelado' && (
                  <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
                    <form action={marcarTurno.bind(null, t.id)} className="flex flex-wrap gap-1.5">
                      <input type="hidden" name="volver" value={volver} />
                      {!t.tecnico_id && <button name="tomar" value="1" className="btn-sec py-1">Lo atiendo yo</button>}
                      {t.estado !== 'atendido' && <button name="estado" value="atendido" className="btn-sec py-1">Atendido</button>}
                      {t.estado === 'reservado' && <button name="estado" value="ausente" className="btn-sec py-1">No vino</button>}
                      {t.estado !== 'reservado' && new Date(t.fin).getTime() > Date.now() && <button name="estado" value="reservado" className="btn-sec py-1">Volver a reservado</button>}
                    </form>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-ink/55">Nota o cancelar</summary>
                      <form action={marcarTurno.bind(null, t.id)} className="mt-1 flex gap-1">
                        <input type="hidden" name="volver" value={volver} />
                        <input name="nota" className="campo py-1 text-xs" placeholder="Nota interna" maxLength={1000} />
                        <button className="btn-sec py-1">Guardar</button>
                      </form>
                      {t.estado === 'reservado' && (
                        <form action={cancelarTurnoStaff.bind(null, t.id)} className="mt-1 flex gap-1">
                          <input type="hidden" name="volver" value={volver} />
                          <input name="motivo" className="campo py-1 text-xs" placeholder="Motivo (le llega a la persona)" maxLength={300} />
                          <button className="btn-sec py-1 text-red-700">Cancelar</button>
                        </form>
                      )}
                    </details>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
