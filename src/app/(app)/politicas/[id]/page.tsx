import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { aplicaA, type Politica } from '@/lib/politicas'
import Markdown from '@/components/Markdown'
import { aceptarPolitica } from '../acciones'

export default async function VerPolitica({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error } = await searchParams
  const { db, perfil, staff } = await sesion()
  const { data } = await db.from('politicas').select('*').eq('id', id).maybeSingle()
  const p = data as Politica | null
  if (!p || (!p.publicada && !staff)) notFound()
  const { data: ac } = await db.from('politica_aceptaciones').select('aceptada_en').eq('politica_id', p.id).eq('perfil_id', perfil.id).eq('version', p.version).maybeSingle()
  const corresponde = p.publicada && aplicaA(p, perfil)

  return (
    <article className="mx-auto max-w-3xl space-y-5">
      <Link href="/politicas" className="text-sm text-ink/55 hover:text-ink">← Políticas</Link>
      <header>
        <h1>{p.titulo}</h1>
        <p className="text-sm text-ink/55">
          Versión {p.version}{p.publicada_en ? ` · vigente desde el ${fecha(p.publicada_en)}` : ''}{!p.publicada ? ' · borrador (no publicada)' : ''}
        </p>
      </header>
      {p.resumen && <p className="rounded-lg bg-brand-50/70 px-4 py-3 text-sm text-ink/80"><strong>En pocas palabras:</strong> {p.resumen}</p>}
      {p.contenido && <div className="tarjeta p-5"><Markdown texto={p.contenido} /></div>}
      {p.enlace && (
        <p className="text-sm">
          <a href={p.enlace} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Ver el documento completo</a>
        </p>
      )}

      {ac ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">✓ Aceptaste esta versión el {fecha(ac.aceptada_en)}.</p>
      ) : corresponde ? (
        <form action={aceptarPolitica.bind(null, p.id, p.version)} className="tarjeta space-y-3 p-4">
          {error === 'marcar' && <p role="alert" className="text-sm text-red-700">Marcá la casilla para confirmar.</p>}
          {error === 'version' && <p role="alert" className="text-sm text-red-700">La política se actualizó mientras la leías. Revisá esta versión y aceptala.</p>}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="lei" required className="mt-0.5 accent-brand-600" />
            <span>Leí la política “{p.titulo}” (versión {p.version}), la entiendo y me comprometo a cumplirla.</span>
          </label>
          <button className="btn">Aceptar</button>
          <p className="text-xs text-ink/45">Queda registrado con tu usuario, la fecha y la versión.</p>
        </form>
      ) : null}
    </article>
  )
}
