import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { InsigniaEstado } from '@/components/Insignias'
import type { Ticket } from '@/lib/tipos'

export default async function Portal() {
  const { db, perfil } = await sesion()
  const { data } = await db
    .from('tickets')
    .select('*')
    .eq('solicitante_id', perfil.id)
    .order('actualizado_en', { ascending: false })
    .limit(200)
  const tickets = (data ?? []) as Ticket[]

  return (
    <div className="space-y-5">
      <div>
        <h1>Mis tickets</h1>
        <p className="text-sm text-black/60">Tus pedidos y el estado de cada uno.</p>
      </div>

      {tickets.length === 0 ? (
        <div className="tarjeta p-8 text-center">
          <p className="font-medium">Todavía no cargaste ningún pedido.</p>
          <p className="mt-1 text-sm text-black/60">Contanos qué necesitás y lo derivamos al sector que corresponde.</p>
          <Link href="/portal/nuevo" className="btn mt-4">
            Cargar un ticket
          </Link>
        </div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>N.º</th>
                <th>Asunto</th>
                <th>Estado</th>
                <th>Última novedad</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="text-black/50">#{t.numero}</td>
                  <td>
                    <Link href={`/tickets/${t.id}`} className="font-medium hover:text-marca hover:underline">
                      {t.asunto}
                    </Link>
                  </td>
                  <td>
                    <InsigniaEstado estado={t.estado} />
                  </td>
                  <td className="whitespace-nowrap text-black/60">{fecha(t.actualizado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
