import { contextoDe } from '@/lib/cyber'

// Estado de seguridad de una persona del equipo, desde Accusys Cyber. Se carga aparte para no demorar la página.

const diasDesde = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

function Marca({ ok, texto }: { ok: boolean | null; texto: string }) {
  const c = ok == null ? 'bg-ink/5 text-ink/55' : ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
  return <span className={`pill ${c}`}>{ok === false ? '⚠ ' : ok ? '✓ ' : ''}{texto}</span>
}

export default async function Cumplimiento({ email }: { email: string }) {
  const { datos: d } = await contextoDe(email, 'mi-equipo')
  if (!d?.encontrado) return <span className="text-xs text-ink/45">Sin datos del inventario</span>
  const cap = d.capacitaciones ?? []
  const capMal = cap.filter((c) => c.estado !== 'al_dia').length
  const equiposMal = (d.equipos ?? []).filter(
    (e) => e.reinicio_pendiente || e.antivirus === false || (e.eset?.abiertas ?? 0) > 0 || (e.ultimo_reporte && diasDesde(e.ultimo_reporte) > 14) || (e.cifrado && !/^cifrad/i.test(e.cifrado)),
  ).length
  return (
    <div className="flex flex-wrap gap-1">
      {d.mfa && <Marca ok={d.mfa.activo} texto={d.mfa.activo ? 'MFA' : 'Sin MFA'} />}
      {cap.length > 0 && <Marca ok={capMal === 0} texto={capMal ? `${capMal} capacitación${capMal === 1 ? '' : 'es'} pendiente${capMal === 1 ? '' : 's'}` : 'Capacitaciones al día'} />}
      {(d.equipos?.length ?? 0) > 0 && <Marca ok={equiposMal === 0} texto={equiposMal ? `${equiposMal} equipo${equiposMal === 1 ? '' : 's'} con avisos` : `${d.equipos!.length} equipo${d.equipos!.length === 1 ? '' : 's'} OK`} />}
      {d.ad?.bloqueada && <Marca ok={false} texto="Usuario bloqueado" />}
    </div>
  )
}
