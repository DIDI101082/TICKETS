import { exigirAdmin } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { fecha } from '@/lib/formato'
import { borrarDefinitivo, restaurar } from '../acciones2'
import Importar from './Importar'

export default async function Datos() {
  await exigirAdmin()
  // La papelera se lee del lado del servidor: desde la app nadie ve los tickets eliminados.
  const { data } = await admin().from('tickets').select('id,numero,asunto,solicitante_nombre,solicitante_email,eliminado_en,eliminado_por').not('eliminado_en', 'is', null).order('eliminado_en', { ascending: false }).limit(200)
  const papelera = (data ?? []) as { id: string; numero: number; asunto: string; solicitante_nombre: string; solicitante_email: string; eliminado_en: string; eliminado_por: string }[]

  return (
    <div className="space-y-8">
      <div>
        <h1>Datos</h1>
        <p className="text-sm text-ink/60">Papelera e importación de tickets. La retención de adjuntos se define en General → Mantenimiento automático.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2>Papelera</h2>
          <p className="text-sm text-ink/60">Tickets eliminados. No aparecen en la bandeja, el tablero ni los reportes. Se pueden restaurar o borrar para siempre.</p>
        </div>
        <div className="tarjeta overflow-x-auto">
          {papelera.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/60">La papelera está vacía.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Asunto</th>
                  <th>Solicitante</th>
                  <th>Eliminado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {papelera.map((t) => (
                  <tr key={t.id}>
                    <td className="text-ink/50">#{t.numero}</td>
                    <td className="font-medium">{t.asunto}</td>
                    <td className="text-ink/70">{t.solicitante_nombre || t.solicitante_email}</td>
                    <td className="whitespace-nowrap text-ink/60">{fecha(t.eliminado_en)} · {t.eliminado_por}</td>
                    <td>
                      <div className="flex justify-end gap-3">
                        <form action={restaurar.bind(null, t.id)}>
                          <button className="text-sm text-brand-600 hover:underline">Restaurar</button>
                        </form>
                        <form action={borrarDefinitivo.bind(null, t.id)}>
                          <button className="text-sm text-ink/50 hover:text-red-700">Borrar para siempre</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2>Importar historial</h2>
          <p className="text-sm text-ink/60">Para traer los tickets de otro sistema. Entran con el canal “importado”, no envían avisos ni se escalan, y conservan su fecha.</p>
        </div>
        <div className="tarjeta p-4">
          <Importar />
        </div>
      </section>
    </div>
  )
}
