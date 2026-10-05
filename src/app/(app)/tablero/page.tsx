import Link from 'next/link'
import { exigirStaff } from '@/lib/auth'
import { duracion } from '@/lib/formato'
import { ACTIVOS, type Sector, type Ticket } from '@/lib/tipos'

function Cifra({ titulo, valor, nota, href, alerta }: { titulo: string; valor: string | number; nota?: string; href?: string; alerta?: boolean }) {
  const cuerpo = (
    <div className="tarjeta h-full p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-black/50">{titulo}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${alerta ? 'text-red-700' : ''}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-black/50">{nota}</p>}
    </div>
  )
  return href ? <Link href={href} className="block transition hover:opacity-80">{cuerpo}</Link> : cuerpo
}

function Barras({ filas }: { filas: { etiqueta: string; valor: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.valor))
  if (!filas.length) return <p className="text-sm text-black/50">Sin datos.</p>
  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li key={f.etiqueta} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-black/70">{f.etiqueta}</span>
          <span className="h-2.5 rounded-full bg-black/[0.06]">
            <span className="block h-2.5 rounded-full bg-marca" style={{ width: `${(f.valor / max) * 100}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">{f.valor}</span>
        </li>
      ))}
    </ul>
  )
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')

export default async function Tablero() {
  const { db } = await exigirStaff()
  const [rt, rs, rp] = await Promise.all([
    db.from('tickets').select('*').order('creado_en', { ascending: false }).limit(5000),
    db.from('sectores').select('*').order('orden'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']),
  ])
  const tickets = (rt.data ?? []) as Ticket[]
  const sectores = (rs.data ?? []) as Sector[]
  const agentes = (rp.data ?? []) as { id: string; nombre: string; email: string }[]

  const ahora = Date.now()
  const hace30 = ahora - 30 * 86400000
  const ms = (d: string) => new Date(d).getTime()

  const activos = tickets.filter((t) => ACTIVOS.includes(t.estado))
  const cuenta = (e: string) => tickets.filter((t) => t.estado === e).length
  const resueltos30 = tickets.filter((t) => t.resuelto_en && ms(t.resuelto_en) >= hace30)
  const creados30 = tickets.filter((t) => ms(t.creado_en) >= hace30)

  const vencidos = activos.filter(
    (t) =>
      (t.estado !== 'en_espera' && t.vence_resolucion && ms(t.vence_resolucion) < ahora) ||
      (!t.primera_respuesta_en && t.vence_respuesta && ms(t.vence_respuesta) < ahora),
  )

  const conRespuesta = creados30.filter((t) => t.primera_respuesta_en && t.vence_respuesta)
  const respOk = conRespuesta.filter((t) => ms(t.primera_respuesta_en!) <= ms(t.vence_respuesta!))
  const conResol = resueltos30.filter((t) => t.vence_resolucion)
  const resolOk = conResol.filter((t) => ms(t.resuelto_en!) <= ms(t.vence_resolucion!))

  const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const tResp = promedio(conRespuesta.map((t) => (ms(t.primera_respuesta_en!) - ms(t.creado_en)) / 60000))
  const tResol = promedio(resueltos30.map((t) => (ms(t.resuelto_en!) - ms(t.creado_en)) / 60000 - t.segundos_pausa / 60))

  const porSector = [
    ...sectores.map((s) => ({ etiqueta: s.nombre, valor: activos.filter((t) => t.sector_id === s.id).length })),
    { etiqueta: 'Triage', valor: activos.filter((t) => !t.sector_id).length },
  ]
  const porAgente = agentes
    .map((a) => ({
      nombre: a.nombre || a.email,
      activos: activos.filter((t) => t.asignado_id === a.id).length,
      resueltos: resueltos30.filter((t) => t.asignado_id === a.id).length,
    }))
    .filter((a) => a.activos || a.resueltos)
    .sort((a, b) => b.activos - a.activos)

  const edad = (t: Ticket) => (ahora - ms(t.creado_en)) / 86400000
  const antiguedad = [
    { etiqueta: 'Menos de 1 día', valor: activos.filter((t) => edad(t) < 1).length },
    { etiqueta: '1 a 3 días', valor: activos.filter((t) => edad(t) >= 1 && edad(t) < 3).length },
    { etiqueta: '3 a 7 días', valor: activos.filter((t) => edad(t) >= 3 && edad(t) < 7).length },
    { etiqueta: 'Más de 7 días', valor: activos.filter((t) => edad(t) >= 7).length },
  ]
  const porCanal = ['portal', 'email', 'teams'].map((c) => ({ etiqueta: c[0].toUpperCase() + c.slice(1), valor: creados30.filter((t) => t.canal === c).length }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Tablero</h1>
          <p className="text-sm text-black/60">Situación actual y resultados de los últimos 30 días.</p>
        </div>
        <a href="/api/export" className="btn-sec">Exportar a Excel (CSV)</a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Cifra titulo="Abiertos" valor={cuenta('abierto')} href="/agente?estado=abierto" />
        <Cifra titulo="En curso" valor={cuenta('en_curso')} href="/agente?estado=en_curso" />
        <Cifra titulo="En espera" valor={cuenta('en_espera')} href="/agente?estado=en_espera" />
        <Cifra titulo="En triage" valor={activos.filter((t) => !t.sector_id).length} href="/agente?vista=triage" />
        <Cifra titulo="SLA vencido" valor={vencidos.length} alerta={vencidos.length > 0} nota="tickets activos" />
        <Cifra titulo="Resueltos" valor={resueltos30.length} nota={`de ${creados30.length} creados en 30 días`} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="SLA de respuesta" valor={pct(respOk.length, conRespuesta.length)} nota={`${respOk.length} de ${conRespuesta.length} a tiempo`} />
        <Cifra titulo="SLA de resolución" valor={pct(resolOk.length, conResol.length)} nota={`${resolOk.length} de ${conResol.length} a tiempo`} />
        <Cifra titulo="Tiempo medio de respuesta" valor={tResp == null ? '—' : duracion(tResp)} />
        <Cifra titulo="Tiempo medio de resolución" valor={tResol == null ? '—' : duracion(tResol)} nota="sin contar el tiempo en espera" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tarjeta p-4">
          <h2 className="mb-3">Tickets activos por sector</h2>
          <Barras filas={porSector} />
        </section>
        <section className="tarjeta p-4">
          <h2 className="mb-3">Antigüedad de los tickets activos</h2>
          <Barras filas={antiguedad} />
        </section>
        <section className="tarjeta overflow-x-auto p-4">
          <h2 className="mb-2">Por agente</h2>
          {porAgente.length === 0 ? (
            <p className="text-sm text-black/50">Todavía no hay tickets asignados.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th className="text-right">Activos</th>
                  <th className="text-right">Resueltos (30 d)</th>
                </tr>
              </thead>
              <tbody>
                {porAgente.map((a) => (
                  <tr key={a.nombre}>
                    <td>{a.nombre}</td>
                    <td className="text-right tabular-nums">{a.activos}</td>
                    <td className="text-right tabular-nums">{a.resueltos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="tarjeta p-4">
          <h2 className="mb-3">Canal de entrada (30 días)</h2>
          <Barras filas={porCanal} />
        </section>
      </div>
    </div>
  )
}
