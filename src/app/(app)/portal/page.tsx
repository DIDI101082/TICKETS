import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { InsigniaEstado } from '@/components/Insignias'
import type { Ticket } from '@/lib/tipos'

export default async function Portal({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams
  const { db, perfil } = await sesion()

  const { count: pendientes } = await db
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('aprobador_id', perfil.id)
    .eq('aprobacion_estado', 'pendiente')

  const veOrg = perfil.ve_organizacion && !!perfil.organizacion_id
  const vista = ver === 'aprobar' ? 'aprobar' : ver === 'org' && veOrg ? 'org' : 'mios'

  let q = db.from('tickets').select('*').order('actualizado_en', { ascending: false }).limit(300)
  if (vista === 'aprobar') q = q.eq('aprobador_id', perfil.id).eq('aprobacion_estado', 'pendiente')
  else if (vista === 'org') q = q.eq('organizacion_id', perfil.organizacion_id!)
  else q = q.eq('solicitante_id', perfil.id)
  const { data } = await q
  const tickets = (data ?? []) as Ticket[]

  const solapas = [
    { valor: 'mios', texto: 'Mis tickets' },
    ...(veOrg ? [{ valor: 'org', texto: 'De mi organización' }] : []),
    ...((pendientes ?? 0) > 0 || vista === 'aprobar' ? [{ valor: 'aprobar', texto: `Para aprobar (${pendientes ?? 0})` }] : []),
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1>{vista === 'aprobar' ? 'Pedidos para aprobar' : vista === 'org' ? 'Tickets de mi organización' : 'Mis tickets'}</h1>
        <p className="text-sm text-ink/60">Los pedidos y el estado de cada uno.</p>
      </div>

      {solapas.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-line/10 text-sm">
          {solapas.map((s) => (
            <Link
              key={s.valor}
              href={`/portal?ver=${s.valor}`}
              className={`-mb-px border-b-2 px-3 py-2 ${vista === s.valor ? 'border-brand-500 font-medium text-brand-600' : 'border-transparent text-ink/55 hover:text-ink'}`}
            >
              {s.texto}
            </Link>
          ))}
        </nav>
      )}

      {tickets.length === 0 ? (
        <div className="tarjeta p-8 text-center">
          <p className="font-medium">{vista === 'mios' ? 'Todavía no cargaste ningún pedido.' : 'No hay tickets en esta vista.'}</p>
          {vista === 'mios' && (
            <>
              <p className="mt-1 text-sm text-ink/60">Contanos qué necesitás y lo derivamos al sector que corresponde.</p>
              <Link href="/portal/nuevo" className="btn mt-4">Cargar un ticket</Link>
            </>
          )}
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
    </div>
  )
}
