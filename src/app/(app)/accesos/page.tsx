import Link from 'next/link'
import { exigirStaff } from '@/lib/auth'
import { aInputFecha, diasHasta, fecha, soloFecha } from '@/lib/formato'
import { proximaRecertificacion, type Acceso } from '@/lib/tipos'
import { cambiarVencimiento, quitarAhora, reconfirmar } from './acciones'

const VISTAS = [
  { valor: 'vigentes', etiqueta: 'Vigentes' },
  { valor: 'por_vencer', etiqueta: 'Vencen en 7 días' },
  { valor: 'reconfirmar', etiqueta: 'A reconfirmar' },
  { valor: 'quitar', etiqueta: 'Por quitar' },
  { valor: 'quitados', etiqueta: 'Quitados' },
] as const

export default async function Accesos({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const { ver = 'vigentes', q = '' } = await searchParams
  const { db, supervisor } = await exigirStaff()

  const [ra, rc] = await Promise.all([
    db.from('accesos').select('*').order('creado_en', { ascending: false }).limit(2000),
    db.from('categorias').select('id,recertificar_dias'),
  ])
  if (ra.error) {
    return (
      <div className="tarjeta p-6 text-sm">
        <h1>Accesos otorgados</h1>
        <p className="mt-2 text-ink/65">Falta ejecutar <code>supabase/006_accesos_y_conocimiento.sql</code> en Supabase.</p>
      </div>
    )
  }
  const todos = (ra.data ?? []) as Acceso[]
  const dias = new Map((rc.data ?? []).map((c) => [c.id as string, Number(c.recertificar_dias) || 90]))
  const recert = (a: Acceso) => proximaRecertificacion(a, (a.categoria_id && dias.get(a.categoria_id)) || 90)
  const ahora = Date.now()
  const semana = ahora + 7 * 86400000

  const grupos: Record<string, Acceso[]> = {
    vigentes: todos.filter((a) => a.estado === 'vigente'),
    por_vencer: todos.filter((a) => a.estado === 'vigente' && a.hasta && new Date(a.hasta).getTime() <= semana),
    reconfirmar: todos.filter((a) => a.estado === 'vigente' && !a.hasta && (a.recertificar_token || recert(a).getTime() <= ahora)),
    quitar: todos.filter((a) => a.estado === 'revocacion_pendiente'),
    quitados: todos.filter((a) => a.estado === 'revocado'),
  }
  const buscar = q.trim().toLowerCase()
  const lista = (grupos[ver] ?? grupos.vigentes)
    .filter((a) => !buscar || `${a.persona_nombre} ${a.persona_email} ${a.sistema}`.toLowerCase().includes(buscar))
    .sort((x, y) => (x.hasta ?? '9999').localeCompare(y.hasta ?? '9999'))

  const ids = [...new Set(lista.flatMap((a) => [a.ticket_id, a.revocar_ticket_id]).filter((x): x is string => !!x))]
  const { data: tks } = ids.length ? await db.from('tickets').select('id,numero').in('id', ids) : { data: [] }
  const numero = new Map((tks ?? []).map((t) => [t.id as string, t.numero as number]))
  const enlace = (id: string | null) => (id && numero.has(id) ? <Link href={`/tickets/${id}`} className="text-brand-600 hover:underline">#{numero.get(id)}</Link> : '—')
  const aqui = `/accesos?ver=${ver}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  return (
    <div className="space-y-5">
      <div>
        <h1>Accesos otorgados</h1>
        <p className="text-sm text-ink/60">
          Se registran solos al resolver un pedido de una categoría que otorga accesos. Antes del vencimiento se le avisa a la persona; al vencer se abre un ticket para quitarlo. Los que no tienen fecha de fin se reconfirman con quien los aprobó.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VISTAS.map((v) => (
          <Link
            key={v.valor}
            href={`/accesos?ver=${v.valor}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-full border px-3 py-1 text-sm ${ver === v.valor ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line/10 text-ink/60 hover:text-ink'}`}
          >
            {v.etiqueta} <span className="tabular-nums text-ink/45">{grupos[v.valor].length}</span>
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="ver" value={ver} />
          <input name="q" defaultValue={q} placeholder="Buscar persona o sistema" className="campo w-56" aria-label="Buscar" />
        </form>
      </div>

      <div className="tarjeta overflow-x-auto">
        {lista.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink/60">No hay accesos en esta vista.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Acceso</th>
                <th>Pedido</th>
                <th>Vence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                const d = a.hasta ? diasHasta(a.hasta) : null
                return (
                  <tr key={a.id} className="align-top">
                    <td>
                      <span className="font-medium">{a.persona_nombre || a.persona_email || '—'}</span>
                      {a.persona_nombre && a.persona_email && <span className="block text-xs text-ink/50">{a.persona_email}</span>}
                    </td>
                    <td className="max-w-md">{a.sistema}</td>
                    <td className="whitespace-nowrap">
                      {enlace(a.ticket_id)}
                      <span className="block text-xs text-ink/50">{soloFecha(a.otorgado_en)}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      {a.estado === 'revocado' ? (
                        <span className="text-ink/60">Quitado {soloFecha(a.revocado_en)}{a.revocado_por ? ` · ${a.revocado_por}` : ''}</span>
                      ) : a.estado === 'revocacion_pendiente' ? (
                        <span className="pill bg-orange-50 text-orange-700">Por quitar · {enlace(a.revocar_ticket_id)}</span>
                      ) : a.hasta ? (
                        <>
                          {fecha(a.hasta)}
                          <span className={`block text-xs ${d! <= 0 ? 'text-red-700' : d! <= 3 ? 'text-amber-700' : 'text-ink/50'}`}>
                            {d! <= 0 ? 'Vencido: se quita en la próxima revisión' : d === 1 ? 'Mañana' : `En ${d} días`}
                            {a.fecha_estimada ? ' · fecha estimada' : ''}
                          </span>
                        </>
                      ) : (
                        <>
                          Sin fecha de fin
                          <span className={`block text-xs ${a.recertificar_token ? 'text-amber-700' : 'text-ink/50'}`}>
                            {a.recertificar_token ? `Reconfirmación pedida el ${soloFecha(a.recertificar_pedido_en)}` : `Reconfirmar el ${soloFecha(recert(a).toISOString())}`}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="text-right">
                      {a.estado === 'vigente' && (
                        <details className="text-left text-sm">
                          <summary className="cursor-pointer text-right text-xs text-brand-600">Acciones</summary>
                          <div className="mt-2 w-72 space-y-3">
                            {supervisor && (
                              <form action={cambiarVencimiento.bind(null, a.id)} className="space-y-1.5">
                                <input type="hidden" name="volver" value={aqui} />
                                <label className="rotulo" htmlFor={`h-${a.id}`}>Vence</label>
                                <input id={`h-${a.id}`} name="hasta" type="datetime-local" defaultValue={aInputFecha(a.hasta)} className="campo" />
                                <label className="flex items-center gap-2 text-xs">
                                  <input type="checkbox" name="sin_fecha" defaultChecked={!a.hasta} className="accent-brand-600" /> Sin fecha de fin (se reconfirma)
                                </label>
                                <button className="btn-sec w-full">Guardar fecha</button>
                              </form>
                            )}
                            {supervisor && !a.hasta && (
                              <form action={reconfirmar.bind(null, a.id)}>
                                <input type="hidden" name="volver" value={aqui} />
                                <button className="btn-sec w-full">Sigue haciendo falta</button>
                              </form>
                            )}
                            <form action={quitarAhora.bind(null, a.id)} className="space-y-1.5">
                              <input type="hidden" name="volver" value={aqui} />
                              <input name="motivo" placeholder="Motivo (opcional)" className="campo" />
                              <button className="btn-sec w-full text-red-700">Quitar ahora</button>
                            </form>
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
