import Link from 'next/link'
import { redirect } from 'next/navigation'
import { exigirStaff } from '@/lib/auth'
import { leerMantenimiento } from '@/lib/config'
import { duracion, APP_NOMBRE } from '@/lib/formato'
import { indicadores, type Fila } from '@/lib/metricas'
import BotonImprimir from '@/components/BotonImprimir'
import type { Ticket } from '@/lib/tipos'

const ZONA = process.env.NEXT_PUBLIC_ZONA_HORARIA || 'America/Argentina/Buenos_Aires'
const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d)
const esFecha = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

function Tabla({ titulo, primera, filas }: { titulo: string; primera: string; filas: Fila[] }) {
  return (
    <section className="tarjeta overflow-x-auto break-inside-avoid">
      <h2 className="px-4 pt-4">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="p-4 text-sm text-ink/50">Sin datos en el período.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>{primera}</th>
              <th className="!text-right">Creados</th>
              <th className="!text-right">Resueltos</th>
              <th className="!text-right">SLA resp.</th>
              <th className="!text-right">SLA resol.</th>
              <th className="!text-right">Tiempo de resol.</th>
              <th className="!text-right">Satisfacción</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.etiqueta}>
                <td className="font-medium">{f.etiqueta}</td>
                <td className="text-right tabular-nums">{f.creados}</td>
                <td className="text-right tabular-nums">{f.resueltos}</td>
                <td className="text-right tabular-nums">{f.slaResp}</td>
                <td className="text-right tabular-nums">{f.slaResol}</td>
                <td className="text-right tabular-nums">{f.tiempoResol == null ? '—' : duracion(f.tiempoResol)}</td>
                <td className="text-right tabular-nums">{f.csat == null ? '—' : `${f.csat.toFixed(1)} (${f.encuestas})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default async function Reportes({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const sp = await searchParams
  const { db, supervisor } = await exigirStaff()
  if ((await leerMantenimiento()).tablero_solo_supervisores && !supervisor) redirect('/agente')

  const hoy = new Date()
  const hasta = esFecha(sp.hasta) ? sp.hasta! : dia(hoy)
  const desde = esFecha(sp.desde) ? sp.desde! : dia(new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1))

  const [rt, rs, ro, rc, rp] = await Promise.all([
    db.from('tickets').select('*').gte('creado_en', `${desde}T00:00:00-03:00`).lte('creado_en', `${hasta}T23:59:59-03:00`).order('creado_en').limit(10000),
    db.from('sectores').select('id,nombre').order('orden'),
    db.from('organizaciones').select('id,nombre').order('nombre'),
    db.from('categorias').select('id,nombre').order('orden'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']).order('nombre'),
  ])
  const tickets = ((rt.data ?? []) as Ticket[]).filter((t) => !t.fusionado_en_id)

  const mes = (d: string) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' }).format(new Date(d))
  const meses = [...new Set(tickets.map((t) => mes(t.creado_en)))].sort()
  const nombreMes = (m: string) => {
    const [a, n] = m.split('-').map(Number)
    return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, n - 1, 15)))
  }

  const agrupar = <T extends { id: string }>(lista: T[], nombre: (x: T) => string, clave: keyof Ticket, resto: string) =>
    [
      ...lista.map((x) => indicadores(nombre(x), tickets.filter((t) => t[clave] === x.id))),
      indicadores(resto, tickets.filter((t) => !t[clave])),
    ].filter((f) => f.creados > 0)

  const total = indicadores('Total', tickets)
  const horas = Math.round(tickets.reduce((n, t) => n + (t.minutos_trabajados ?? 0), 0) / 6) / 10

  // Calidad de la derivación: de los tickets en que la IA sugirió un sector, cuántos siguen en ese sector.
  const nombreSector = new Map((rs.data ?? []).map((s) => [s.id as string, s.nombre as string]))
  const conIa = tickets.filter((t) => t.ia_sector)
  const acierta = (t: Ticket) => !!t.sector_id && nombreSector.get(t.sector_id) === t.ia_sector
  const calidad = [...new Set(conIa.map((t) => t.ia_sector!))]
    .map((sugerido) => {
      const suyos = conIa.filter((t) => t.ia_sector === sugerido)
      const destinos = new Map<string, number>()
      for (const t of suyos.filter((x) => !acierta(x))) {
        const d = t.sector_id ? nombreSector.get(t.sector_id) ?? 'Otro' : 'Triage'
        destinos.set(d, (destinos.get(d) ?? 0) + 1)
      }
      return { sugerido, total: suyos.length, bien: suyos.filter(acierta).length, destinos: [...destinos.entries()].sort((a, b) => b[1] - a[1]) }
    })
    .sort((a, b) => b.total - a.total)
  const bienTotal = conIa.filter(acierta).length
  const maxMes = Math.max(1, ...meses.map((m) => tickets.filter((t) => mes(t.creado_en) === m).length))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/tablero" className="text-sm text-ink/50 hover:text-ink print:hidden">← Tablero</Link>
          <h1>Reporte por período</h1>
          <p className="text-sm text-ink/60">
            {APP_NOMBRE} · tickets creados entre el {desde.split('-').reverse().join('/')} y el {hasta.split('-').reverse().join('/')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 print:hidden">
          <form className="flex flex-wrap items-end gap-2">
            <div>
              <label className="rotulo" htmlFor="desde">Desde</label>
              <input id="desde" type="date" name="desde" defaultValue={desde} className="campo" />
            </div>
            <div>
              <label className="rotulo" htmlFor="hasta">Hasta</label>
              <input id="hasta" type="date" name="hasta" defaultValue={hasta} className="campo" />
            </div>
            <button className="btn">Ver</button>
          </form>
          <BotonImprimir />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ['Satisfacción', total.csat == null ? '—' : `${total.csat.toFixed(1)} / 5`],
          ['Creados', total.creados],
          ['Resueltos', total.resueltos],
          ['SLA de respuesta', total.slaResp],
          ['SLA de resolución', total.slaResol],
          ['Horas registradas', horas],
        ].map(([t, v]) => (
          <div key={t} className="tarjeta p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <section className="tarjeta break-inside-avoid p-4">
        <h2 className="mb-3">Tendencia mensual: creados y resueltos</h2>
        {meses.length === 0 ? (
          <p className="text-sm text-ink/50">Sin datos en el período.</p>
        ) : (
          <ul className="space-y-2.5">
            {meses.map((m) => {
              const delMes = tickets.filter((t) => mes(t.creado_en) === m)
              const res = delMes.filter((t) => t.resuelto_en).length
              return (
                <li key={m} className="grid grid-cols-[9rem_1fr_7rem] items-center gap-3 text-sm">
                  <span className="capitalize text-ink/70">{nombreMes(m)}</span>
                  <span className="space-y-1">
                    <span className="block h-2.5 rounded-full bg-brand-600" style={{ width: `${Math.max(1, (delMes.length / maxMes) * 100)}%` }} />
                    <span className="block h-2.5 rounded-full bg-brand-300" style={{ width: `${Math.max(res ? 1 : 0, (res / maxMes) * 100)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-ink/70">{delMes.length} / {res}</span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-3 flex gap-4 text-xs text-ink/55">
          <span><span className="mr-1.5 inline-block h-2 w-3 rounded-full bg-brand-600" />Creados</span>
          <span><span className="mr-1.5 inline-block h-2 w-3 rounded-full bg-brand-300" />Resueltos</span>
        </p>
      </section>

      <Tabla titulo="Por mes" primera="Mes" filas={meses.map((m) => indicadores(nombreMes(m), tickets.filter((t) => mes(t.creado_en) === m)))} />
      <Tabla titulo="Por sector" primera="Sector" filas={agrupar(rs.data ?? [], (s) => s.nombre, 'sector_id', 'Triage')} />
      <Tabla titulo="Por organización" primera="Organización" filas={agrupar(ro.data ?? [], (o) => o.nombre, 'organizacion_id', 'Sin organización')} />
      <Tabla titulo="Por categoría" primera="Categoría" filas={agrupar(rc.data ?? [], (c) => c.nombre, 'categoria_id', 'Sin categoría')} />
      <Tabla titulo="Por agente" primera="Agente" filas={agrupar(rp.data ?? [], (a) => a.nombre || a.email, 'asignado_id', 'Sin asignar')} />

      <section className="tarjeta overflow-x-auto break-inside-avoid">
        <div className="px-4 pt-4">
          <h2>Calidad de la derivación por IA</h2>
          <p className="text-sm text-ink/60">
            {conIa.length === 0
              ? 'La IA no sugirió sector para ningún ticket del período.'
              : `De ${conIa.length} tickets con sugerencia, ${bienTotal} (${Math.round((bienTotal / conIa.length) * 100)}%) siguen en el sector que propuso. Donde más se corrige, conviene ajustar la descripción del sector.`}
          </p>
        </div>
        {calidad.length > 0 && (
          <table className="tabla">
            <thead>
              <tr>
                <th>Sector sugerido</th>
                <th className="!text-right">Sugerencias</th>
                <th className="!text-right">Coincidió</th>
                <th>Cuando no, terminó en</th>
              </tr>
            </thead>
            <tbody>
              {calidad.map((c) => (
                <tr key={c.sugerido}>
                  <td className="font-medium">{c.sugerido}</td>
                  <td className="text-right tabular-nums">{c.total}</td>
                  <td className="text-right tabular-nums">{Math.round((c.bien / c.total) * 100)}%</td>
                  <td className="text-ink/70">{c.destinos.length ? c.destinos.map(([d, n]) => `${d} (${n})`).join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-ink/45">
        El tiempo de resolución descuenta el tiempo en espera. La satisfacción es el promedio de las encuestas respondidas (cantidad entre paréntesis).
      </p>
    </div>
  )
}
