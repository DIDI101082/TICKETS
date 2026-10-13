import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { CLIC, esClic, queHacer } from '@/lib/phishing'
import { reportarPhishing } from './acciones'
import Enviar from './Enviar'

// "Reportar phishing": la persona sube el correo (.eml o .msg) o pega lo que vio.
// Se analiza solo y le llega a Ciberseguridad con prioridad según lo que la persona haya hecho.

const enlazar = (t: string) =>
  t.split(/(https:\/\/\S+)/).map((p, i) =>
    /^https:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener" className="underline">{p.replace('https://', '')}</a> : p,
  )

export default async function ReportarPhishing({ searchParams }: { searchParams: Promise<{ listo?: string; clic?: string; error?: string }> }) {
  const sp = await searchParams
  const { db } = await sesion()

  if (sp.listo) {
    const { data: t } = await db.from('tickets').select('id,numero').eq('id', sp.listo).maybeSingle()
    const clic = esClic(sp.clic) ? sp.clic : 'no'
    const grave = clic !== 'no'
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className={`tarjeta space-y-3 p-6 ${grave ? 'border-red-300' : ''}`}>
          <h1>{grave ? 'Gracias por avisar. Hacé esto ahora:' : '¡Gracias por reportarlo!'}</h1>
          {!grave && <p className="text-sm text-ink/70">Reportar es la mejor defensa: si el correo es malicioso, lo bloqueamos para toda la empresa.</p>}
          <ol className={`list-decimal space-y-1.5 pl-5 text-sm ${grave ? 'font-medium text-red-800' : 'text-ink/80'}`}>
            {queHacer(clic).map((x) => <li key={x}>{enlazar(x)}</li>)}
          </ol>
          {t && (
            <p className="text-sm text-ink/60">
              Tu reporte es el pedido <Link href={`/tickets/${t.id}`} className="font-medium text-brand-600 hover:underline">#{t.numero}</Link>. Te avisamos ahí qué era.
            </p>
          )}
        </div>
        <Link href="/portal" className="text-sm text-brand-600 hover:underline">← Volver al inicio</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1>Reportar phishing</h1>
        <p className="text-sm text-ink/60">¿Te llegó un correo raro? Mandánoslo y lo revisamos. Lo analizamos automáticamente y lo ve Ciberseguridad.</p>
      </div>

      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.error === 'grande' ? 'El archivo supera los 3,5 MB. Pegá el texto del correo en lugar de adjuntarlo.' : 'Adjuntá el correo o contanos al menos quién lo mandó o qué decía.'}
        </p>
      )}

      <form action={reportarPhishing} className="tarjeta space-y-4 p-5">
        <fieldset className="space-y-1.5">
          <legend className="rotulo">¿Hiciste algo con el correo?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLIC.map((c, i) => (
              <label key={c.valor} className="flex items-center gap-2 rounded-lg border border-line/10 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60">
                <input type="radio" name="clic" value={c.valor} defaultChecked={i === 0} className="accent-brand-600" />
                {c.texto}
              </label>
            ))}
          </div>
          <p className="text-xs text-ink/50">Contanos la verdad, nadie te va a retar: si hiciste clic, cuanto antes lo sepamos, mejor.</p>
        </fieldset>

        <div>
          <label className="rotulo" htmlFor="correo">El correo (recomendado)</label>
          <input id="correo" name="correo" type="file" accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook" className="campo file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
          <details className="mt-1 text-xs text-ink/55">
            <summary className="cursor-pointer text-brand-600">¿Cómo lo guardo desde Outlook?</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li><strong>Outlook de escritorio:</strong> arrastrá el correo de la bandeja al escritorio y subí ese archivo (.msg).</li>
              <li><strong>Outlook nuevo o en la web:</strong> abrí el correo → “…” (más acciones) → Guardar como o Descargar (queda un .eml).</li>
              <li><strong>No lo abras para guardarlo</strong> si tiene adjuntos o imágenes: alcanza con seleccionarlo.</li>
            </ul>
            <p className="mt-1">El archivo trae las cabeceras técnicas, que son las que muestran de dónde vino de verdad.</p>
          </details>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="remitente">Quién lo mandó</label>
            <input id="remitente" name="remitente" maxLength={200} className="campo" placeholder="nombre@dominio.com" />
          </div>
          <div>
            <label className="rotulo" htmlFor="asunto">Asunto</label>
            <input id="asunto" name="asunto" maxLength={300} className="campo" />
          </div>
        </div>
        <div>
          <label className="rotulo" htmlFor="texto">Texto del correo (si no lo adjuntaste)</label>
          <textarea id="texto" name="texto" rows={5} className="campo" placeholder="Pegá acá el contenido. Para copiar un enlace sin abrirlo: clic derecho → Copiar vínculo." />
        </div>
        <div>
          <label className="rotulo" htmlFor="comentario">¿Algo más que quieras contarnos?</label>
          <input id="comentario" name="comentario" maxLength={2000} className="campo" placeholder="Ej.: me llamaron por teléfono diciendo lo mismo" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink/50">Después de reportarlo, borralo de tu bandeja.</p>
          <Enviar />
        </div>
      </form>
    </div>
  )
}
