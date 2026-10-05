import Link from 'next/link'
import { exigirStaff } from '@/lib/auth'
import { duracion } from '@/lib/formato'
import { pct, promedio } from '@/lib/metricas'
import { ACTIVOS, type Sector, type Ticket } from '@/lib/tipos'

function Cifra({ titulo, valor, nota, href, alerta }: { titulo: string; valor: string | number; nota?: string; href?: string; alerta?: boolean }) {
  const cuerpo = (
    <div className="tarjeta h-full p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{titulo}</p>
      <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${alerta ? 'text-red-700' : ''}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-ink/50">{nota}</p>}
    </div>
  )
  return href ? <Link href={href} className="block transition hover:opacity-80">{cuerpo}</Link> : cuerpo
}

function Barras({ filas }: { filas: { etiqueta: string; valor: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.valor))
  if (!filas.length) return <p className="text-sm text-ink/50">Sin datos.</p>
  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li key={f.etiqueta} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-ink/70">{f.etiqueta}</span>
          <span className="h-2.5 rounded-full bg-line/[0.06]">
            <span className="block h-2.5 rounded-full bg-brand-600" style={{ width: `${(f.valor / max) * 100}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">{f.valor}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function Tablero() {
  const { db } = await exigirStaff()
  const [rt, rs, rp, ro] = await Promise.all([
    db.from('tickets').select('*').order('creado_en', { ascending: false }).limit(5000),
    db.from('sectores').select('*').order('orden'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']),
    db.from('organizaciones').select('id,nombre').order('nombre'),
  ])
  const tickets = ((rt.data ?? []) as Ticket[]).filter((t) => !t.fusionado_en_id)
  const sectores = (rs.data ?? []) as Sector[]
  const agentes = (rp.data ?? []) as { id: string; nombre: string; email: string }[]
  const orgs = (ro.data ?? []) as { id: string; nombre: string }[]

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
  const tResp = promedio(conRespuesta.map((t) => (ms(t.primera_respuesta_en!) - ms(t.creado_en)) / 60000))
  const tResol = promedio(resueltos30.map((t) => (ms(t.resuelto_en!) - ms(t.creado_en)) / 60000 - t.segundos_pausa / 60))
  const calificados = tickets.filter((t) => t.csat_puntaje && ms(t.creado_en) >= hace30)
  const csat = promedio(calificados.map((t) => t.csat_puntaje!))

  const porSector = [
    ...sectores.map((s) => ({ etiqueta: s.nombre, valor: activos.filter((t) => t.sector_id === s.id).length })),
    { etiqueta: 'Triage', valor: activos.filter((t) => !t.sector_id).length },
  ]
  const porOrg = orgs.map((o) => ({ etiqueta: o.nombre, valor: activos.filter((t) => t.organizacion_id === o.id).length })).filter((o) => o.valor > 0)
  const porAgente = agentes
    .map((a) => {
      const suyos = calificados.filter((t) => t.asignado_id === a.id)
      return {
        nombre: a.nombre || a.email,
        activos: activos.filter((t) => t.asignado_id === a.id).length,
        resueltos: resueltos30.filter((t) => t.asignado_id === a.id).length,
        csat: promedio(suyos.map((t) => t.csat_puntaje!)),
      }
    })
    .filter((a) => a.activos || a.resueltos)
    .sort((a, b) => b.activos - a.activos)

  const edad = (t: Ticket) => (ahora - ms(t.creado_en)) / 86400000
  const antiguedad = [
    { etiqueta: 'Menos de 1 día', valor: activos.filter((t) => edad(t) < 1).length },
    { etiqueta: '1 a 3 días', valor: activos.filter((t) => edad(t) >= 1 && edad(t) < 3).length },
    { etiqueta: '3 a 7 días', valor: activos.filter((t) => edad(t) >= 3 && edad(t) < 7).length },
    { etiqueta: 'Más de 7 días', valor: activos.filter((t) => edad(t) >= 7).length },
  ]
  const canales = ['portal', 'email', 'teams', 'monitoreo', 'programado']
  const porCanal = canales.map((c) => ({ etiqueta: c[0].toUpperCase() + c.slice(1), valor: creados30.filter((t) => t.canal === c).length })).filter((c) => c.valor > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Tablero</h1>
          <p className="text-sm text-ink/60">Situación actual y resultados de los últimos 30 días.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/tablero/reportes" className="btn-sec">Reportes por período</Link>
          <a href="/api/export" className="btn-sec">Exportar a Excel (CSV)</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra titulo="Abiertos" valor={cuenta('abierto')} href="/agente?estado=abierto" />
        <Cifra titulo="En curso" valor={cuenta('en_curso')} href="/agente?estado=en_curso" />
        <Cifra titulo="En espera" valor={cuenta('en_espera')} href="/agente?estado=en_espera" />
        <Cifra titulo="En triage" valor={activos.filter((t) => !t.sector_id).length} href="/agente?vista=triage" />
        <Cifra titulo="SLA vencido" valor={vencidos.length} alerta={vencidos.length > 0} nota="tickets activos" />
        <Cifra titulo="Escalados" valor={activos.filter((t) => t.escalado_en).length} href="/agente?vista=escalados" />
        <Cifra titulo="Posibles incidentes" valor={activos.filter((t) => t.incidente).length} href="/agente?vista=incidentes" alerta={activos.some((t) => t.incidente)} />
        <Cifra titulo="Esperan aprobación" valor={activos.filter((t) => t.aprobacion_estado === 'pendiente').length} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cifra titulo="Resueltos" valor={resueltos30.length} nota={`de ${creados30.length} creados`} />
        <Cifra titulo="SLA de respuesta" valor={pct(respOk.length, conRespuesta.length)} nota={`${respOk.length} de ${conRespuesta.length} a tiempo`} />
        <Cifra titulo="SLA de resolución" valor={pct(resolOk.length, conResol.length)} nota={`${resolOk.length} de ${conResol.length} a tiempo`} />
        <Cifra titulo="Tiempo de resolución" valor={tResol == null ? '—' : duracion(tResol)} nota={`respuesta: ${tResp == null ? '—' : duracion(tResp)}`} />
        <Cifra titulo="Satisfacción" valor={csat == null ? '—' : `${csat.toFixed(1)} / 5`} nota={`${calificados.length} encuestas`} />
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
            <p className="text-sm text-ink/50">Todavía no hay tickets asignados.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th className="!text-right">Activos</th>
                  <th className="!text-right">Resueltos</th>
                  <th className="!text-right">Satisfacción</th>
                </tr>
              </thead>
              <tbody>
                {porAgente.map((a) => (
                  <tr key={a.nombre}>
                    <td>{a.nombre}</td>
                    <td className="text-right tabular-nums">{a.activos}</td>
                    <td className="text-right tabular-nums">{a.resueltos}</td>
                    <td className="text-right tabular-nums">{a.csat == null ? '—' : a.csat.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="tarjeta p-4">
          <h2 className="mb-3">{porOrg.length ? 'Tickets activos por organización' : 'Canal de entrada (30 días)'}</h2>
          <Barras filas={porOrg.length ? porOrg : porCanal} />
        </section>
      </div>
    </div>
  )
}
