import { redirect } from 'next/navigation'
import Mark from '@/components/Mark'
import { admin } from '@/lib/supabase/admin'
import { registrarDecision } from '@/lib/aprobaciones'
import type { Ticket } from '@/lib/tipos'

// Página pública: quien tiene el enlace que llegó por mail puede decidir sin iniciar sesión.
// El enlace es de un solo uso y solo muestra los datos del pedido que hay que aprobar.

async function buscar(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const { data } = await admin().from('tickets').select('*').eq('aprobacion_token', token).eq('aprobacion_estado', 'pendiente').is('eliminado_en', null).maybeSingle()
  return (data as Ticket | null) ?? null
}

async function decidir(token: string, form: FormData) {
  'use server'
  const t = await buscar(token)
  const decision = String(form.get('decision') || '')
  if (!t || !t.aprobador_id || (decision !== 'aprobado' && decision !== 'rechazado')) redirect(`/aprobar/${token}`)
  const { data: aprobador } = await admin().from('perfiles').select('id,nombre,email').eq('id', t.aprobador_id).maybeSingle()
  if (!aprobador) redirect(`/aprobar/${token}`)
  await registrarDecision(t, decision, String(form.get('nota') || '').trim(), aprobador)
  redirect(`/aprobar/${token}?hecho=${decision}`)
}

export default async function Aprobar({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ hecho?: string }> }) {
  const { token } = await params
  const { hecho } = await searchParams
  const t = hecho ? null : await buscar(token)

  return (
    <div className="min-h-screen px-4 py-10">
      <main className="mx-auto max-w-xl space-y-5">
        <div className="flex items-end gap-1.5">
          <Mark className="h-6" />
          <span className="font-display text-lg font-extrabold leading-none tracking-tight text-brand-600">Tickets</span>
        </div>

        {hecho ? (
          <div className="tarjeta p-6">
            <h1>{hecho === 'aprobado' ? 'Pedido aprobado' : 'Pedido rechazado'}</h1>
            <p className="mt-2 text-sm text-ink/65">Registramos tu decisión y le avisamos a quien lo pidió. Ya podés cerrar esta página.</p>
          </div>
        ) : !t ? (
          <div className="tarjeta p-6">
            <h1>Este enlace ya no sirve</h1>
            <p className="mt-2 text-sm text-ink/65">El pedido ya fue aprobado o rechazado, o el enlace es incorrecto. Si tenés que revisarlo, ingresá a la mesa de ayuda.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm text-ink/50">Pedido #{t.numero} · necesita tu aprobación</p>
              <h1>{t.asunto}</h1>
              <p className="mt-1 text-sm text-ink/60">
                Lo pidió {t.solicitante_nombre || t.solicitante_email}
                {t.beneficiario_nombre ? ` para ${t.beneficiario_nombre}` : ''}
              </p>
            </div>
            <div className="tarjeta p-4">
              {t.datos?.length > 0 && (
                <dl className="mb-3 grid gap-x-6 gap-y-1.5 border-b border-line/[0.06] pb-3 text-sm sm:grid-cols-2">
                  {t.datos.map((d, i) => (
                    <div key={i}>
                      <dt className="text-xs text-ink/50">{d.etiqueta}</dt>
                      <dd className="whitespace-pre-wrap">{d.valor || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.descripcion}</p>
            </div>
            <form action={decidir.bind(null, token)} className="tarjeta space-y-3 p-4">
              <label className="rotulo" htmlFor="nota">Comentario (opcional)</label>
              <textarea id="nota" name="nota" rows={2} className="campo" />
              <div className="flex gap-2">
                <button name="decision" value="aprobado" className="btn">Aprobar</button>
                <button name="decision" value="rechazado" className="btn-sec">Rechazar</button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
