import Link from 'next/link'
import { after } from 'next/server'
import { exigirStaff } from '@/lib/auth'
import { revisarSiToca } from '@/lib/sla'
import { hace, slaRespuesta, slaResolucion } from '@/lib/formato'
import { InsigniaEstado, InsigniaPrioridad, TextoSla } from '@/components/Insignias'
import { ACTIVOS, ESTADOS, type Sector, type Ticket } from '@/lib/tipos'

const VISTAS = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'mios', texto: 'Asignados a mí' },
  { valor: 'mis_sectores', texto: 'Mis sectores' },
  { valor: 'sin_asignar', texto: 'Sin asignar' },
  { valor: 'triage', texto: 'Triage' },
  { valor: 'incidentes', texto: 'Incidentes' },
  { valor: 'escalados', texto: 'Escalados' },
  { valor: 'todos', texto: 'Todos' },
]

const PESO: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }

export default async function Bandeja({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; estado?: string; sector?: string; org?: string; cat?: string; q?: string }>
}) {
  const sp = await searchParams
  const { db, perfil } = await exigirStaff()
  const vista = VISTAS.some((v) => v.valor === sp.vista) ? sp.vista! : 'activos'

  // Avisos de SLA, escalamiento y programados: corre después de responder, como mucho cada 10 minutos.
  after(revisarSiToca)

  const [rs, rp, rmis, rorg, rcat] = await Promise.all([
    db.from('sectores').select('*').order('orden'),
    db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']),
    db.from('agente_sectores').select('sector_id').eq('perfil_id', perfil.id),
    db.from('organizaciones').select('id,nombre').order('nombre'),
    db.from('categorias').select('id,nombre').order('orden'),
  ])
  const sectores = (rs.data ?? []) as Sector[]
  const orgs = (rorg.data ?? []) as { id: string; nombre: string }[]
  const cats = (rcat.data ?? []) as { id: string; nombre: string }[]
  const nombreSector = new Map(sectores.map((s) => [s.id, s.nombre]))
  const nombreOrg = new Map(orgs.map((o) => [o.id, o.nombre]))
  const nombreAgente = new Map((rp.data ?? []).map((a) => [a.id as string, (a.nombre || a.email) as string]))
  const misSectores = (rmis.data ?? []).map((x) => x.sector_id as string)

  let q = db.from('tickets').select('*').order('creado_en', { ascending: false }).limit(300)
  if (sp.estado && ESTADOS.some((e) => e.valor === sp.estado)) q = q.eq('estado', sp.estado)
  else if (vista !== 'todos') q = q.in('estado', ACTIVOS)

  if (vista === 'mios') q = q.eq('asignado_id', perfil.id)
  if (vista === 'sin_asignar') q = q.is('asignado_id', null)
  if (vista === 'triage') q = q.is('sector_id', null)
  if (vista === 'incidentes') q = q.eq('incidente', true)
  if (vista === 'escalados') q = q.not('escalado_en', 'is', null)
  if (vista === 'mis_sectores') q = q.in('sector_id', misSectores.length ? misSectores : ['00000000-0000-0000-0000-000000000000'])
  if (sp.sector) q = q.eq('sector_id', sp.sector)
  if (sp.org) q = q.eq('organizacion_id', sp.org)
  if (sp.cat) q = q.eq('categoria_id', sp.cat)

  const busqueda = (sp.q ?? '').trim()
  if (/^#?\d+$/.test(busqueda)) q = q.eq('numero', Number(busqueda.replace('#', '')))
  else if (busqueda) {
    const limpio = busqueda.replace(/[,()%*\\]/g, ' ').trim()
    if (limpio) q = q.or(`asunto.ilike.%${limpio}%,solicitante_email.ilike.%${limpio}%,solicitante_nombre.ilike.%${limpio}%,equipo.ilike.%${limpio}%`)
  }

  const { data } = await q
  const tickets = ((data ?? []) as Ticket[]).sort(
    (a, b) => (PESO[a.prioridad] ?? 9) - (PESO[b.prioridad] ?? 9) || a.creado_en.localeCompare(b.creado_en),
  )
  const incidentes = vista === 'incidentes' ? 0 : tickets.filter((t) => t.incidente && ACTIVOS.includes(t.estado)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Bandeja</h1>
          <p className="text-sm text-ink/60">{tickets.length} tickets · ordenados por prioridad y antigüedad</p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="vista" value={vista} />
          <input name="q" defaultValue={busqueda} placeholder="N.º, asunto, solicitante o equipo" className="campo w-60" />
          <select name="sector" defaultValue={sp.sector ?? ''} className="campo w-auto" aria-label="Sector">
            <option value="">Todos los sectores</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          {orgs.length > 0 && (
            <select name="org" defaultValue={sp.org ?? ''} className="campo w-auto" aria-label="Organización">
              <option value="">Todas las organizaciones</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.nombre}</option>
              ))}
            </select>
          )}
          {cats.length > 0 && (
            <select name="cat" defaultValue={sp.cat ?? ''} className="campo w-auto" aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
          <select name="estado" defaultValue={sp.estado ?? ''} className="campo w-auto" aria-label="Estado">
            <option value="">Estado</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
            ))}
          </select>
          <button className="btn-sec">Filtrar</button>
        </form>
      </div>

      {incidentes > 0 && (
        <Link href="/agente?vista=incidentes" className="block rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Posible incidente:</strong> {incidentes} tickets parecidos entraron en poco tiempo. Ver cuáles →
        </Link>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-line/10 text-sm">
        {VISTAS.map((v) => (
          <Link
            key={v.valor}
            href={`/agente?vista=${v.valor}`}
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
          <table className="tabla">
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
                const respondido = t.primera_respuesta_en || t.resuelto_en
                return (
                  <tr key={t.id}>
                    <td className="text-ink/50">#{t.numero}</td>
                    <td className="max-w-sm">
                      <Link href={`/tickets/${t.id}`} className="block truncate font-medium hover:text-brand-600 hover:underline">{t.asunto}</Link>
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink/50">
                        <span className="truncate">
                          {t.solicitante_nombre || t.solicitante_email}
                          {t.organizacion_id && nombreOrg.get(t.organizacion_id) ? ` · ${nombreOrg.get(t.organizacion_id)}` : ''}
                        </span>
                        {t.confidencial && <span className="pill bg-violet-50 text-violet-700">Confidencial</span>}
                        {t.incidente && <span className="pill bg-red-50 text-red-700">Incidente</span>}
                        {t.escalado_en && <span className="pill bg-orange-50 text-orange-700">Escalado</span>}
                        {t.aprobacion_estado === 'pendiente' && <span className="pill bg-amber-500/10 text-amber-700">Aprobación</span>}
                      </span>
                    </td>
                    <td><InsigniaPrioridad prioridad={t.prioridad} /></td>
                    <td><InsigniaEstado estado={t.estado} /></td>
                    <td>{t.sector_id ? nombreSector.get(t.sector_id) : <span className="font-medium text-amber-700">Triage</span>}</td>
                    <td className="text-ink/70">{t.asignado_id ? nombreAgente.get(t.asignado_id) ?? '—' : '—'}</td>
                    <td className="whitespace-nowrap text-ink/60">{hace(t.creado_en)}</td>
                    <td>
                      <span className="mr-1 text-xs text-ink/40">{respondido ? 'Resol.' : 'Resp.'}</span>
                      <TextoSla sla={respondido ? slaResolucion(t) : slaRespuesta(t)} />
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
