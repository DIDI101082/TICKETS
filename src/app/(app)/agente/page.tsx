import Link from 'next/link'
import { exigirStaff } from '@/lib/auth'
import { hace, slaRespuesta, slaResolucion } from '@/lib/formato'
import { InsigniaEstado, InsigniaPrioridad, TextoSla } from '@/components/Insignias'
import { ACTIVOS, ESTADOS, type Sector, type Ticket } from '@/lib/tipos'

const VISTAS = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'mios', texto: 'Asignados a mí' },
  { valor: 'mis_sectores', texto: 'Mis sectores' },
  { valor: 'sin_asignar', texto: 'Sin asignar' },
  { valor: 'triage', texto: 'Triage' },
  { valor: 'todos', texto: 'Todos' },
]

const PESO: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }

export default async function Bandeja({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; estado?: string; sector?: string; q?: string }>
}) {
  const sp = await searchParams
  const { db, perfil } = await exigirStaff()
  const vista = VISTAS.some((v) => v.valor === sp.vista) ? sp.vista! : 'activos'

  const [rs, rp, rmis] = await Promise.all([
    db.from('sectores').select('*').order('orden'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']),
    db.from('agente_sectores').select('sector_id').eq('perfil_id', perfil.id),
  ])
  const sectores = (rs.data ?? []) as Sector[]
  const nombreSector = new Map(sectores.map((s) => [s.id, s.nombre]))
  const nombreAgente = new Map((rp.data ?? []).map((a) => [a.id as string, (a.nombre || a.email) as string]))
  const misSectores = (rmis.data ?? []).map((x) => x.sector_id as string)

  let q = db.from('tickets').select('*').order('creado_en', { ascending: false }).limit(300)
  if (sp.estado && ESTADOS.some((e) => e.valor === sp.estado)) q = q.eq('estado', sp.estado)
  else if (vista !== 'todos') q = q.in('estado', ACTIVOS)

  if (vista === 'mios') q = q.eq('asignado_id', perfil.id)
  if (vista === 'sin_asignar') q = q.is('asignado_id', null)
  if (vista === 'triage') q = q.is('sector_id', null)
  if (vista === 'mis_sectores') q = q.in('sector_id', misSectores.length ? misSectores : ['00000000-0000-0000-0000-000000000000'])
  if (sp.sector) q = q.eq('sector_id', sp.sector)

  const busqueda = (sp.q ?? '').trim()
  if (/^#?\d+$/.test(busqueda)) q = q.eq('numero', Number(busqueda.replace('#', '')))
  else if (busqueda) {
    const limpio = busqueda.replace(/[,()%*\\]/g, ' ').trim()
    if (limpio) q = q.or(`asunto.ilike.%${limpio}%,solicitante_email.ilike.%${limpio}%,solicitante_nombre.ilike.%${limpio}%`)
  }

  const { data } = await q
  const tickets = ((data ?? []) as Ticket[]).sort(
    (a, b) => (PESO[a.prioridad] ?? 9) - (PESO[b.prioridad] ?? 9) || a.creado_en.localeCompare(b.creado_en),
  )

  const enlace = (v: string) => {
    const p = new URLSearchParams()
    p.set('vista', v)
    return `/agente?${p}`
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Bandeja</h1>
          <p className="text-sm text-ink/60">{tickets.length} tickets · ordenados por prioridad y antigüedad</p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="vista" value={vista} />
          <input name="q" defaultValue={busqueda} placeholder="Buscar por n.º, asunto o solicitante" className="campo w-64" />
          <select name="sector" defaultValue={sp.sector ?? ''} className="campo w-auto">
            <option value="">Todos los sectores</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <select name="estado" defaultValue={sp.estado ?? ''} className="campo w-auto">
            <option value="">Estado</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
            ))}
          </select>
          <button className="btn-sec">Filtrar</button>
        </form>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line/10 text-sm">
        {VISTAS.map((v) => (
          <Link
            key={v.valor}
            href={enlace(v.valor)}
            className={`-mb-px border-b-2 px-3 py-2 ${vista === v.valor ? 'border-brand-500 font-medium text-brand-600' : 'border-transparent text-ink/55 hover:text-ink'}`}
          >
            {v.texto}
          </Link>
        ))}
      </nav>

      {tickets.length === 0 ? (
        <p className="tarjeta p-8 text-center text-sm text-ink/60">No hay tickets en esta vista.</p>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla data">
            <thead>
              <tr>
                <th>N.º</th>
                <th>Asunto</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Sector</th>
                <th>Asignado</th>
                <th>Abierto hace</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const sla = t.primera_respuesta_en || t.resuelto_en ? slaResolucion(t) : slaRespuesta(t)
                return (
                  <tr key={t.id}>
                    <td className="text-ink/50">#{t.numero}</td>
                    <td className="max-w-xs">
                      <Link href={`/tickets/${t.id}`} className="block truncate font-medium hover:text-brand-600 hover:underline">
                        {t.asunto}
                      </Link>
                      <span className="block truncate text-xs text-ink/50">{t.solicitante_nombre || t.solicitante_email}</span>
                    </td>
                    <td><InsigniaPrioridad prioridad={t.prioridad} /></td>
                    <td><InsigniaEstado estado={t.estado} /></td>
                    <td>{t.sector_id ? nombreSector.get(t.sector_id) : <span className="font-medium text-amber-700">Triage</span>}</td>
                    <td className="text-ink/70">{t.asignado_id ? nombreAgente.get(t.asignado_id) ?? '—' : '—'}</td>
                    <td className="whitespace-nowrap text-ink/60">{hace(t.creado_en)}</td>
                    <td>
                      <span className="mr-1 text-xs text-ink/40">{t.primera_respuesta_en || t.resuelto_en ? 'Resol.' : 'Resp.'}</span>
                      <TextoSla sla={sla} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
