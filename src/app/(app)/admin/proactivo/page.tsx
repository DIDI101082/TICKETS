import Link from 'next/link'
import { exigirAdmin } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import { cyberConfigurado } from '@/lib/cyber'
import { leerProactivo, problemasActuales, TIPOS, type TipoProactivo } from '@/lib/proactivo'
import type { Sector } from '@/lib/tipos'
import { guardarProactivo, revisarAhora } from './acciones'

export default async function Proactivo({ searchParams }: { searchParams: Promise<{ ok?: string; abiertos?: string; resueltos?: string }> }) {
  const sp = await searchParams
  const { db } = await exigirAdmin()
  const conf = await leerProactivo()
  const [{ data: rs }, { lista, error }, { data: abiertos }] = await Promise.all([
    db.from('sectores').select('*').eq('activo', true).order('orden'),
    cyberConfigurado() ? problemasActuales(conf) : Promise.resolve({ lista: null, error: 'Falta configurar la conexión con Accusys Cyber (CYBER_SUPABASE_URL, CYBER_SUPABASE_ANON_KEY y CYBER_CONTEXTO_TOKEN).' }),
    db.from('tickets').select('id,numero,clave_externa').like('clave_externa', 'proactivo:%').in('estado', ['abierto', 'en_curso', 'en_espera']),
  ])
  const sectores = (rs ?? []) as Sector[]
  const ticketDe = new Map((abiertos ?? []).map((t) => [String(t.clave_externa), t]))
  const porTipo = (t: TipoProactivo) => (lista ?? []).filter((p) => p.tipo === t).length
  const tipos = Object.keys(TIPOS) as TipoProactivo[]
  // Autoservicio: diagnósticos que vio la gente antes de cargar un pedido (últimos 30 días)
  const { data: auto } = await db.from('autoservicio').select('resultado,hallazgos').gte('creado_en', new Date(Date.now() - 30 * 86400000).toISOString()).limit(5000)
  const autos = (auto ?? []) as { resultado: string; hallazgos: { titulo: string; id: string }[] }[]
  const resueltos = autos.filter((a) => a.resultado === 'resuelto').length
  const conTicket = autos.filter((a) => a.resultado === 'ticket').length
  const causas = new Map<string, number>()
  for (const a of autos) for (const h of a.hallazgos ?? []) {
    const k = h.id.split(':')[0]
    causas.set(k, (causas.get(k) ?? 0) + 1)
  }
  const CAUSA: Record<string, string> = { uptime: 'Sin reiniciar hace días', reinicio: 'Reinicio pendiente', disco: 'Disco casi lleno', ram: 'Memoria llena', parches: 'Windows sin actualizar', eset: 'Amenaza del antivirus', av: 'Antivirus apagado', forti: 'FortiClient desactualizado', ad: 'Cuenta (bloqueo o contraseña)', m365: 'Microsoft 365 deshabilitada', mfa: 'Sin verificación en dos pasos', acceso: 'Permiso de VPN vencido o faltante', sinreporte: 'Equipo sin reportar', ia: 'Sugerencias de la IA' }

  return (
    <div className="space-y-6">
      <div>
        <h1>Soporte proactivo</h1>
        <p className="max-w-3xl text-sm text-ink/60">
          Accusys Cyber revisa los equipos asignados a cada persona. Cuando detecta un problema, acá se abre un ticket a su nombre y se le avisa qué pasa y qué
          puede hacer, antes de que llame. Cuando el problema desaparece, el ticket se resuelve solo. La revisión corre cada 6 horas.
        </p>
      </div>
      {sp.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">Guardamos la configuración.</p>}
      {sp.abiertos != null && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">Revisión hecha: {sp.abiertos} ticket(s) nuevo(s) y {sp.resueltos} resuelto(s).</p>}
      {conf.ultimo_error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Última revisión con error: {conf.ultimo_error}</p>}

      <section className="tarjeta space-y-3 p-5">
        <h2>Revisión antes de enviar un pedido (últimos 30 días)</h2>
        <p className="max-w-3xl text-sm text-ink/60">
          En las categorías con “Revisar antes de enviar” (Administración → Categorías), Desk le muestra a la persona lo que encuentra en su equipo y su cuenta y cómo resolverlo.
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-canvas p-3"><p className="font-display text-2xl tabular-nums">{autos.length}</p><p className="text-xs text-ink/55">revisiones mostradas</p></div>
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800"><p className="font-display text-2xl tabular-nums">{resueltos}</p><p className="text-xs">se resolvieron sin ticket</p></div>
          <div className="rounded-lg bg-canvas p-3"><p className="font-display text-2xl tabular-nums">{conTicket}</p><p className="text-xs text-ink/55">siguieron con el pedido</p></div>
        </div>
        {causas.size > 0 && (
          <p className="text-sm text-ink/70">
            Lo que más encontramos: {[...causas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${CAUSA[k] ?? k} (${n})`).join(' · ')}
          </p>
        )}
      </section>

      <form action={guardarProactivo} className="tarjeta space-y-4 p-5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="activo" defaultChecked={conf.activo} className="accent-brand-600" />
          Abrir tickets automáticamente
        </label>
        <p className="-mt-2 text-xs text-ink/50">Apagado, la lista de abajo se puede revisar igual, pero no se abre ningún ticket. Conviene mirarla antes de activarlo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Días sin conectarse para avisar
            <input name="dias_sin_reporte" type="number" min={2} max={60} defaultValue={conf.dias_sin_reporte} className="campo mt-1 w-28" />
          </label>
          <label className="text-sm">Espacio libre mínimo en disco (%)
            <input name="disco_pct" type="number" min={1} max={50} defaultValue={conf.disco_pct} className="campo mt-1 w-28" />
          </label>
        </div>
        <table className="tabla">
          <thead>
            <tr><th>Problema</th><th>Activo</th><th>Sector que lo atiende</th><th className="text-right">Detectados hoy</th></tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t}>
                <td>{TIPOS[t].nombre}</td>
                <td><input type="checkbox" name={`activo_${t}`} defaultChecked={conf.tipos[t]?.activo} className="accent-brand-600" aria-label={`Activar: ${TIPOS[t].nombre}`} /></td>
                <td>
                  <select name={`sector_${t}`} defaultValue={conf.tipos[t]?.sector_id ?? ''} className="campo w-auto py-1" aria-label={`Sector para ${TIPOS[t].nombre}`}>
                    <option value="">{TIPOS[t].sector} (predeterminado)</option>
                    {sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </td>
                <td className="text-right tabular-nums">{lista ? porTipo(t) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn">Guardar</button>
          {conf.ultima && <span className="text-xs text-ink/50">Última revisión: {fecha(conf.ultima)}{conf.ultimo_resultado ? ` · ${conf.ultimo_resultado.abiertos} nuevos, ${conf.ultimo_resultado.resueltos} resueltos` : ''}</span>}
        </div>
      </form>
      {conf.activo && (
        <form action={revisarAhora}>
          <button className="btn-sec">Revisar ahora</button>
        </form>
      )}

      <section className="space-y-2">
        <h2>Lo que detecta Accusys Cyber hoy</h2>
        {!lista ? (
          <p className="tarjeta p-4 text-sm text-red-700">{error}</p>
        ) : lista.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-ink/60">No hay problemas en los equipos asignados.</p>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Persona</th><th>Equipo</th><th>Problema</th><th>Ticket</th></tr></thead>
              <tbody>
                {lista.map((p) => {
                  const t = ticketDe.get(`proactivo:${p.clave}`)
                  return (
                    <tr key={p.clave}>
                      <td>{p.nombre || p.email}<span className="block text-xs text-ink/50">{p.email}</span></td>
                      <td>{p.equipo}</td>
                      <td>{TIPOS[p.tipo].nombre}<span className="block text-xs text-ink/55">{p.detalle}</span></td>
                      <td>{t ? <Link href={`/tickets/${t.id}`} className="text-brand-600 hover:underline">#{t.numero}</Link> : <span className="text-ink/45">{conf.activo && conf.tipos[p.tipo]?.activo ? 'En la próxima revisión' : 'No se abre'}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
