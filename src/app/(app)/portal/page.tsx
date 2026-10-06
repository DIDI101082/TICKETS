import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { InsigniaEstado } from '@/components/Insignias'
import { ACTIVOS, ESTADOS, type Categoria, type Servicio, type Ticket } from '@/lib/tipos'

export default async function Portal({ searchParams }: { searchParams: Promise<{ ver?: string; estado?: string; q?: string }> }) {
  const sp = await searchParams
  const { db, perfil } = await sesion()

  const veOrg = perfil.ve_organizacion && !!perfil.organizacion_id
  const [rpend, rcat, rserv, rprop] = await Promise.all([
    db.from('tickets').select('id', { count: 'exact', head: true }).eq('aprobador_id', perfil.id).eq('aprobacion_estado', 'pendiente'),
    db.from('categorias').select('*').eq('activo', true).order('orden').order('nombre'),
    db.from('servicios').select('*').neq('estado', 'operativo').order('orden'),
    // Los pedidos propios sirven para ordenar los accesos directos por lo que más usa esta persona.
    db.from('tickets').select('categoria_id').eq('solicitante_id', perfil.id).order('creado_en', { ascending: false }).limit(100),
  ])
  const pendientes = rpend.count ?? 0
  const conProblemas = (rserv.data ?? []) as Servicio[]
  const uso = new Map<string, number>()
  for (const t of rprop.data ?? []) if (t.categoria_id) uso.set(t.categoria_id, (uso.get(t.categoria_id) ?? 0) + 1)
  const categorias = ((rcat.data ?? []) as Categoria[]).sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.orden - b.orden)

  const vista = sp.ver === 'aprobar' ? 'aprobar' : sp.ver === 'org' && veOrg ? 'org' : sp.ver === 'copia' ? 'copia' : 'mios'
  const busca = (sp.q ?? '').replace(/[,()%*\\]/g, ' ').trim()

  // Todo se lee con la sesión del usuario: la base solo devuelve los tickets que puede ver.
  let q = db.from('tickets').select('*').order('actualizado_en', { ascending: false }).limit(300)
  if (vista === 'aprobar') q = q.eq('aprobador_id', perfil.id).eq('aprobacion_estado', 'pendiente')
  else if (vista === 'org') q = q.eq('organizacion_id', perfil.organizacion_id!)
  else if (vista === 'copia') q = q.neq('solicitante_id', perfil.id)
  else q = q.eq('solicitante_id', perfil.id)
  if (sp.estado === 'activos') q = q.in('estado', ACTIVOS)
  else if (sp.estado && ESTADOS.some((e) => e.valor === sp.estado)) q = q.eq('estado', sp.estado)
  if (/^#?\d+$/.test(busca)) q = q.eq('numero', Number(busca.replace('#', '')))
  else if (busca) q = q.ilike('asunto', `%${busca}%`)
  const { data } = await q
  let tickets = (data ?? []) as Ticket[]
  // "Donde participo": pedidos para mí o donde estoy en copia (no los que solo veo por ser referente o aprobador).
  if (vista === 'copia') {
    const { data: seg } = await db.from('ticket_seguidores').select('ticket_id').eq('perfil_id', perfil.id)
    const enCopia = new Set((seg ?? []).map((x) => x.ticket_id as string))
    tickets = tickets.filter((t) => t.beneficiario_id === perfil.id || enCopia.has(t.id))
  }

  const solapas = [
    { valor: 'mios', texto: 'Mis tickets' },
    { valor: 'copia', texto: 'Donde participo' },
    ...(veOrg ? [{ valor: 'org', texto: 'De mi organización' }] : []),
    ...(pendientes > 0 || vista === 'aprobar' ? [{ valor: 'aprobar', texto: `Para aprobar (${pendientes})` }] : []),
  ]
  const nombre = (perfil.nombre || '').split(' ')[0]
  const sinFiltro = !busca && !sp.estado

  return (
    <div className="space-y-7">
      <section className="rounded-2xl bg-[#0A2A6E] bg-[linear-gradient(135deg,#0A2466_0%,#0B3A9E_55%,#1449C8_100%)] px-6 py-8 text-white">
        <h1 className="!text-white">{nombre ? `Hola, ${nombre}` : 'Hola'}. ¿En qué te ayudamos?</h1>
        <form action="/kb" className="mt-4 flex max-w-2xl gap-2">
          <input name="q" placeholder="Buscá en la ayuda: VPN, contraseña, impresora…" aria-label="Buscar en la ayuda" className="block w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-[#1F2937] outline-none placeholder:text-[#1F2937]/45 focus:ring-2 focus:ring-white/60" />
          <button className="shrink-0 rounded-xl border border-white/40 bg-white/15 px-4 text-sm font-medium hover:bg-white/25">Buscar</button>
        </form>
      </section>

      {conProblemas.length > 0 && (
        <Link href="/estado" className="block rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Hay un problema en curso:</strong> {conProblemas.map((s) => s.nombre).join(', ')}. Ya estamos trabajando; no hace falta cargar un ticket por eso. Ver el estado →
        </Link>
      )}

      {pendientes > 0 && vista !== 'aprobar' && (
        <Link href="/portal?ver=aprobar" className="block rounded-xl border border-brand-500 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <strong>Tenés {pendientes} {pendientes === 1 ? 'pedido' : 'pedidos'} para aprobar.</strong> Revisarlos →
        </Link>
      )}

      {categorias.length > 0 && (
        <section className="space-y-3">
          <h2>¿Qué necesitás?</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.slice(0, 9).map((c) => (
              <Link key={c.id} href={`/portal/nuevo?cat=${c.id}`} className="tarjeta block p-4 transition hover:border-brand-500">
                <p className="font-medium">{c.nombre}</p>
                {c.descripcion && <p className="mt-0.5 line-clamp-2 text-sm text-ink/55">{c.descripcion}</p>}
              </Link>
            ))}
          </div>
          {categorias.length > 9 && (
            <Link href="/portal/nuevo" className="text-sm text-brand-600 hover:underline">Ver todos los tipos de pedido →</Link>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <nav className="flex flex-wrap gap-1 text-sm">
            {solapas.map((s) => (
              <Link
                key={s.valor}
                href={`/portal?ver=${s.valor}`}
                className={`rounded-md px-3 py-1.5 font-medium ${vista === s.valor ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink/60 hover:text-ink'}`}
              >
                {s.texto}
              </Link>
            ))}
          </nav>
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="ver" value={vista} />
            <input name="q" defaultValue={busca} placeholder="N.º o asunto" className="campo w-44" />
            <select name="estado" defaultValue={sp.estado ?? ''} className="campo w-auto" aria-label="Estado">
              <option value="">Todos</option>
              <option value="activos">Sin resolver</option>
              {ESTADOS.map((e) => (
                <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
              ))}
            </select>
            <button className="btn-sec">Filtrar</button>
          </form>
        </div>

        {tickets.length === 0 ? (
          <div className="tarjeta p-8 text-center">
            <p className="font-medium">{vista === 'mios' && sinFiltro ? 'Todavía no cargaste ningún pedido.' : 'No hay tickets con ese criterio.'}</p>
            {vista === 'mios' && sinFiltro && <p className="mt-1 text-sm text-ink/60">Elegí arriba qué necesitás y lo derivamos al sector que corresponde.</p>}
          </div>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Asunto</th>
                  {vista !== 'mios' && <th>Solicitante</th>}
                  <th>Estado</th>
                  <th>Última novedad</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="text-ink/50">#{t.numero}</td>
                    <td>
                      <Link href={`/tickets/${t.id}`} className="font-medium hover:text-brand-600 hover:underline">{t.asunto}</Link>
                      {t.aprobacion_estado === 'pendiente' && <span className="pill ml-2 bg-amber-500/10 text-amber-700">Espera aprobación</span>}
                      {['resuelto', 'cerrado'].includes(t.estado) && !t.csat_puntaje && t.solicitante_id === perfil.id && !t.fusionado_en_id && (
                        <Link href={`/tickets/${t.id}#encuesta`} className="ml-2 text-xs text-brand-600 hover:underline">Calificar</Link>
                      )}
                    </td>
                    {vista !== 'mios' && <td className="text-ink/70">{t.solicitante_nombre || t.solicitante_email}</td>}
                    <td><InsigniaEstado estado={t.estado} /></td>
                    <td className="whitespace-nowrap text-ink/60">{fecha(t.actualizado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
