import { redirect } from 'next/navigation'
import Mark from '@/components/Mark'
import { admin } from '@/lib/supabase/admin'
import { registrarRecertificacion } from '@/lib/accesos'
import { fecha } from '@/lib/formato'
import type { Acceso } from '@/lib/tipos'

// Página pública: el responsable confirma desde el mail si un acceso sin fecha de fin sigue haciendo falta.
// El enlace es de un solo uso y solo muestra ese acceso.

async function buscar(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const { data } = await admin().from('accesos').select('*').eq('recertificar_token', token).eq('estado', 'vigente').maybeSingle()
  return (data as Acceso | null) ?? null
}

async function decidir(token: string, form: FormData) {
  'use server'
  const a = await buscar(token)
  const decision = String(form.get('decision') || '')
  if (!a || (decision !== 'sigue' && decision !== 'quitar')) redirect(`/recertificar/${token}`)
  const { data: resp } = a.responsable_id ? await admin().from('perfiles').select('id,nombre,email').eq('id', a.responsable_id).maybeSingle() : { data: null }
  await registrarRecertificacion(a, decision === 'sigue', resp ?? { id: '', nombre: 'Responsable (enlace del mail)', email: '' }, String(form.get('nota') || '').trim())
  redirect(`/recertificar/${token}?hecho=${decision}`)
}

export default async function Recertificar({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ hecho?: string }> }) {
  const { token } = await params
  const { hecho } = await searchParams
  const a = hecho ? null : await buscar(token)

  return (
    <div className="min-h-screen px-4 py-10">
      <main className="mx-auto max-w-xl space-y-5">
        <div className="flex items-end gap-1.5">
          <Mark className="h-6" />
          <span className="font-display text-lg font-extrabold leading-none tracking-tight text-brand-600">Desk</span>
        </div>

        {hecho ? (
          <div className="tarjeta p-6">
            <h1>{hecho === 'sigue' ? 'Acceso reconfirmado' : 'Pedimos quitar el acceso'}</h1>
            <p className="mt-2 text-sm text-ink/65">
              {hecho === 'sigue' ? 'Queda vigente y te lo volvemos a consultar más adelante.' : 'Se abrió un ticket para que el equipo lo quite.'} Ya podés cerrar esta página.
            </p>
          </div>
        ) : !a ? (
          <div className="tarjeta p-6">
            <h1>Este enlace ya no sirve</h1>
            <p className="mt-2 text-sm text-ink/65">El acceso ya se reconfirmó o se quitó, o el enlace es incorrecto.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm text-ink/50">Reconfirmación de acceso</p>
              <h1>¿{a.persona_nombre || a.persona_email} sigue necesitando este acceso?</h1>
            </div>
            <dl className="tarjeta grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink/50">Acceso</dt>
                <dd>{a.sistema}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">Persona</dt>
                <dd>{a.persona_nombre || '—'}{a.persona_email ? ` (${a.persona_email})` : ''}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">Lo tiene desde</dt>
                <dd>{fecha(a.otorgado_en)}</dd>
              </div>
            </dl>
            <form action={decidir.bind(null, token)} className="tarjeta space-y-3 p-4">
              <label className="rotulo" htmlFor="nota">Comentario (opcional)</label>
              <textarea id="nota" name="nota" rows={2} className="campo" />
              <div className="flex flex-wrap gap-2">
                <button name="decision" value="sigue" className="btn">Sí, sigue haciendo falta</button>
                <button name="decision" value="quitar" className="btn-sec">No, quitarlo</button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
