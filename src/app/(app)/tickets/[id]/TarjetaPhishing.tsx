import { admin } from '@/lib/supabase/admin'
import type { Enlace, Indicador } from '@/lib/phishing-analisis'

// Resumen del análisis automático de un reporte de phishing (solo lo ve el equipo).

const COLOR = { alto: 'bg-red-50 text-red-700', medio: 'bg-amber-500/10 text-amber-700', bajo: 'bg-emerald-50 text-emerald-700' } as const
const CLIC: Record<string, string> = { clic: 'Hizo clic en un enlace', contrasena: 'Ingresó usuario o contraseña', adjunto: 'Abrió un adjunto' }
const auth = (v: string | null) => (v == null ? 'text-ink/40' : v === 'pass' ? 'text-emerald-700' : /fail/.test(v) ? 'text-red-700' : 'text-amber-700')

export default async function TarjetaPhishing({ ticketId }: { ticketId: string }) {
  const { data } = await admin().from('phishing_analisis').select('*').eq('ticket_id', ticketId).maybeSingle()
  if (!data) return null
  const a = data as {
    puntaje: number; nivel: keyof typeof COLOR; remitente: string; dominio: string; spf: string | null; dkim: string | null; dmarc: string | null
    indicadores: Indicador[]; enlaces: Enlace[]; hizo_clic: string; con_archivo: boolean
  }
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: otros } = a.remitente
    ? await admin().from('phishing_analisis').select('ticket_id, tickets!inner(numero)').eq('remitente', a.remitente).neq('ticket_id', ticketId).gte('creado_en', desde).limit(20)
    : { data: [] }
  const sospechosos = a.enlaces.filter((e) => e.motivos.length)

  return (
    <div className="tarjeta space-y-2 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2>Análisis del correo</h2>
        <span className={`pill ${COLOR[a.nivel]}`}>Riesgo {a.nivel} · {a.puntaje}</span>
      </div>
      {CLIC[a.hizo_clic] && <p className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">⚠ {CLIC[a.hizo_clic]}</p>}
      <p className="break-all text-ink/70">{a.remitente || 'Remitente desconocido'}</p>
      {a.con_archivo ? (
        <p className="font-mono text-xs">
          <span className={auth(a.spf)}>SPF {a.spf ?? '—'}</span> · <span className={auth(a.dkim)}>DKIM {a.dkim ?? '—'}</span> · <span className={auth(a.dmarc)}>DMARC {a.dmarc ?? '—'}</span>
        </p>
      ) : (
        <p className="text-xs text-ink/50">Sin el correo original: no se revisaron las cabeceras.</p>
      )}
      {a.indicadores.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-ink/75">
          {a.indicadores.slice(0, 6).map((i) => <li key={i.texto}>{i.texto}</li>)}
        </ul>
      )}
      {sospechosos.length > 0 && (
        <details>
          <summary className="cursor-pointer text-ink/60">{sospechosos.length} {sospechosos.length === 1 ? 'enlace sospechoso' : 'enlaces sospechosos'}</summary>
          <ul className="mt-1 space-y-1 font-mono text-xs">
            {sospechosos.slice(0, 10).map((e) => <li key={e.url} className="break-all">{e.dominio} <span className="font-sans text-ink/50">— {e.motivos.join('; ')}</span></li>)}
          </ul>
        </details>
      )}
      {(otros ?? []).length > 0 && (
        <p className="text-amber-800">
          Mismo remitente en {(otros ?? []).length} {(otros ?? []).length === 1 ? 'otro reporte' : 'otros reportes'} (30 días):{' '}
          {(otros ?? []).map((o, i) => {
            const n = (o.tickets as unknown as { numero: number } | null)?.numero
            return <a key={o.ticket_id} href={`/tickets/${o.ticket_id}`} className="underline">{i ? ', ' : ''}#{n}</a>
          })}
        </p>
      )}
      <p className="text-xs text-ink/45">Para cerrar, usá las respuestas “Phishing: confirmado / legítimo / spam”. El detalle completo está en la nota interna.</p>
    </div>
  )
}
