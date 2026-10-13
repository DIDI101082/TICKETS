import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { contextoDe, cyberConfigurado, type EquipoCyber } from '@/lib/cyber'
import { fecha, soloFecha } from '@/lib/formato'
import { InsigniaEstado } from '@/components/Insignias'
import type { Acceso, Categoria, Ticket } from '@/lib/tipos'
import { politicasDe } from '@/lib/politicas'
import { yaNoLoNecesito } from './acciones'

// "Mi espacio": lo que la empresa le asignó a la persona (equipos, accesos, licencias, cuenta)
// y lo que se detectó en sus equipos, con pedidos de un clic sobre cada cosa.

const diasDesde = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

function Estado({ ok, texto }: { ok: boolean | null; texto: string }) {
  const c = ok == null ? 'bg-ink/5 text-ink/55' : ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
  return <span className={`pill ${c}`}>{ok === false ? '⚠ ' : ok ? '✓ ' : ''}{texto}</span>
}

function salud(e: EquipoCyber) {
  const avisos: string[] = []
  const d = e.ultimo_reporte ? diasDesde(e.ultimo_reporte) : null
  if (d != null && d > 7) avisos.push(`No se conecta desde hace ${d} días: conectalo a la red de la oficina o a la VPN para que reciba actualizaciones.`)
  if (e.reinicio_pendiente) avisos.push('Tiene actualizaciones esperando un reinicio: reinicialo cuando puedas.')
  if (e.antivirus === false) avisos.push('El antivirus figura apagado: ya lo está revisando Ciberseguridad.')
  if ((e.eset?.abiertas ?? 0) > 0) avisos.push('El antivirus detectó una amenaza: Ciberseguridad se va a contactar.')
  if (e.cifrado && !/^cifrad/i.test(e.cifrado)) avisos.push('El disco no está cifrado: Ciberseguridad lo va a activar.')
  return avisos
}

export default async function MiEspacio({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams
  const { db, perfil } = await sesion()

  const [racc, rcat, rprop] = await Promise.all([
    db.from('accesos').select('*').eq('persona_id', perfil.id).neq('estado', 'revocado').order('hasta', { ascending: true, nullsFirst: false }),
    db.from('categorias').select('id,nombre,campos').eq('activo', true),
    db.from('tickets').select('*').like('clave_externa', 'proactivo:%').eq('solicitante_id', perfil.id).in('estado', ['abierto', 'en_curso', 'en_espera']).order('creado_en', { ascending: false }),
  ])
  const accesos = (racc.data ?? []) as Acceso[]
  const categorias = (rcat.data ?? []) as Pick<Categoria, 'id' | 'nombre' | 'campos'>[]
  const detectados = (rprop.data ?? []) as Ticket[]
  const cat = (re: RegExp) => categorias.find((c) => re.test(c.nombre))
  const catEquipo = cat(/falla de equipo/i)
  const catAcceso = cat(/acceso o contrase/i)
  const catModif = cat(/modificaci[oó]n de usuario/i)
  const pedir = (c?: { id: string }, extra = '') => (c ? `/portal/nuevo?cat=${c.id}${extra}` : '/portal/nuevo')

  const [cyber, pol] = await Promise.all([
    cyberConfigurado() ? contextoDe(perfil.email, 'mi-espacio') : Promise.resolve(null),
    politicasDe(db, perfil),
  ])
  const d = cyber?.datos
  const capacitaciones = d?.capacitaciones ?? []
  const capPendientes = capacitaciones.filter((c) => c.estado !== 'al_dia')
  const urlCapacitaciones = process.env.NEXT_PUBLIC_CAPACITACIONES_URL || ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Mi espacio</h1>
          <p className="text-sm text-ink/60">Tus equipos, accesos, licencias, políticas y capacitaciones. Desde cada uno podés pedir ayuda con un clic.</p>
        </div>
        <Link href="/portal/phishing" className="btn-sec border-red-300 text-red-700 hover:bg-red-50">⚠ Reportar phishing</Link>
      </div>
      {ok === 'acceso' && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">Listo: pedimos quitar ese acceso. Lo vas a ver como “Se está quitando”.</p>}

      {detectados.length > 0 && (
        <section className="tarjeta space-y-2 border-amber-300 p-4">
          <h2>Detectamos algo en tus equipos</h2>
          <ul className="space-y-1.5 text-sm">
            {detectados.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <InsigniaEstado estado={t.estado} />
                <Link href={`/tickets/${t.id}`} className="font-medium text-brand-600 hover:underline">{t.asunto}</Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink/50">Lo detectó la revisión automática. Si se corrige, el pedido se cierra solo.</p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          <h2>Mis equipos</h2>
          {!cyber ? (
            <p className="tarjeta p-4 text-sm text-ink/60">Todavía no está conectado el inventario de equipos.</p>
          ) : cyber.error ? (
            <p className="tarjeta p-4 text-sm text-ink/60">No pudimos traer tus equipos en este momento.</p>
          ) : !d?.equipos?.length ? (
            <p className="tarjeta p-4 text-sm text-ink/60">No tenés equipos asignados. Si usás uno de la empresa, avisanos así lo registramos.</p>
          ) : (
            d.equipos.map((e) => {
              const avisos = salud(e)
              const dias = e.ultimo_reporte ? diasDesde(e.ultimo_reporte) : null
              return (
                <article key={e.id} className="tarjeta space-y-2 p-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium">{e.codigo || e.hostname || 'Equipo'}</h3>
                    <span className="text-ink/55">{[e.categoria, e.marca, e.modelo].filter(Boolean).join(' · ')}</span>
                  </div>
                  {e.so && <p className="text-xs text-ink/55">{e.so}{e.serie ? ` · serie ${e.serie}` : ''}{e.entregado ? ` · entregado el ${soloFecha(e.entregado)}` : ''}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Estado ok={dias == null ? null : dias <= 7} texto={dias == null ? 'Sin agente' : dias === 0 ? 'Conectado hoy' : `Conectado hace ${dias} d`} />
                    {e.antivirus != null && <Estado ok={e.antivirus && !(e.eset?.abiertas)} texto={e.antivirus ? (e.eset?.abiertas ? 'Antivirus con alertas' : 'Antivirus activo') : 'Antivirus apagado'} />}
                    {e.cifrado && <Estado ok={/^cifrad/i.test(e.cifrado)} texto={/^cifrad/i.test(e.cifrado) ? 'Disco protegido' : 'Disco sin cifrar'} />}
                    {e.reinicio_pendiente && <Estado ok={false} texto="Reinicio pendiente" />}
                  </div>
                  {avisos.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-ink/75">
                      {avisos.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={pedir(catEquipo, `&equipo=${encodeURIComponent(e.codigo || e.hostname || '')}`)} className="btn-sec inline-block">Tengo un problema con este equipo</Link>
                    <Link href={`/turnos?equipo=${encodeURIComponent(e.codigo || e.hostname || '')}`} className="text-brand-600 hover:underline">Pedir turno con el CAU</Link>
                  </div>
                </article>
              )
            })
          )}
        </section>

        <section className="space-y-3">
          <h2>Mis accesos</h2>
          {accesos.length === 0 ? (
            <p className="tarjeta p-4 text-sm text-ink/60">No tenés accesos otorgados por pedidos (VPN fuera de horario, AWS, Azure DevOps, Sentry…).</p>
          ) : (
            <ul className="tarjeta divide-y divide-line/[0.06] text-sm">
              {accesos.map((a) => {
                const dias = a.hasta ? Math.ceil((new Date(a.hasta).getTime() - Date.now()) / 86400000) : null
                return (
                  <li key={a.id} className="space-y-1.5 p-4">
                    <p className="font-medium">{a.sistema}</p>
                    <p className={dias != null && dias <= 3 ? 'text-amber-700' : 'text-ink/60'}>
                      {a.estado === 'revocacion_pendiente' ? 'Se está quitando' : a.hasta ? `Vence el ${fecha(a.hasta)}${dias != null && dias >= 0 ? ` (${dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`})` : ''}` : 'Sin fecha de fin'}
                    </p>
                    {a.estado === 'vigente' && (
                      <div className="flex flex-wrap gap-3 pt-0.5">
                        {a.ticket_id && <Link href={`/portal/nuevo?desde=${a.ticket_id}`} className="text-brand-600 hover:underline">Pedir que se extienda</Link>}
                        <form action={yaNoLoNecesito.bind(null, a.id)}>
                          <button className="text-ink/55 hover:text-red-700">Ya no lo necesito</button>
                        </form>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {d?.licencias && (
            <>
              <h2 className="pt-2">Mis licencias</h2>
              <div className="tarjeta space-y-2 p-4 text-sm">
                {d.licencias.length ? <p>{d.licencias.join(' · ')}</p> : <p className="text-ink/60">No tenés licencias asignadas.</p>}
                <Link href={pedir(catModif)} className="text-brand-600 hover:underline">Pedir otra licencia o programa</Link>
              </div>
            </>
          )}

          {(d?.mfa || d?.ad || d?.m365) && (
            <>
              <h2 className="pt-2">Mi cuenta</h2>
              <div className="tarjeta space-y-2 p-4 text-sm">
                <div className="flex flex-wrap gap-1">
                  {d.ad && <Estado ok={d.ad.habilitada !== false && !d.ad.bloqueada} texto={d.ad.bloqueada ? 'Usuario bloqueado' : d.ad.habilitada === false ? 'Usuario deshabilitado' : 'Usuario activo'} />}
                  {d.mfa && <Estado ok={d.mfa.activo} texto={d.mfa.activo ? 'Verificación en dos pasos activa' : 'Sin verificación en dos pasos'} />}
                  {d.m365 && <Estado ok={d.m365.habilitada} texto={d.m365.habilitada ? 'Microsoft 365 activa' : 'Microsoft 365 deshabilitada'} />}
                </div>
                {d.ad?.clave_cambiada && <p className="text-ink/60">Cambiaste tu contraseña por última vez el {soloFecha(d.ad.clave_cambiada)}.</p>}
                {d.mfa && !d.mfa.activo && (
                  <p className="text-amber-800">Activá la verificación en dos pasos desde <a href="https://aka.ms/mfasetup" target="_blank" rel="noopener" className="underline">aka.ms/mfasetup</a>: protege tu cuenta aunque alguien conozca tu contraseña.</p>
                )}
                {d.ad?.bloqueada && <Link href={pedir(catAcceso)} className="btn-sec inline-block">Pedir que me desbloqueen</Link>}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {(pol.lista.length > 0 || pol.error == null) && (
          <section className="space-y-3">
            <h2>Políticas</h2>
            {pol.lista.length === 0 ? (
              <p className="tarjeta p-4 text-sm text-ink/60">No hay políticas publicadas para leer.</p>
            ) : (
              <div className="tarjeta space-y-2 p-4 text-sm">
                {pol.pendientes.length > 0 ? (
                  <>
                    <p className="font-medium text-amber-800">Tenés {pol.pendientes.length === 1 ? 'una para leer y aceptar' : `${pol.pendientes.length} para leer y aceptar`}:</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {pol.pendientes.map((p) => (
                        <li key={p.id}><Link href={`/politicas/${p.id}`} className="text-brand-600 hover:underline">{p.titulo}</Link>{p.aceptoAnterior ? <span className="text-xs text-ink/50"> (versión nueva)</span> : null}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-emerald-700">✓ Aceptaste todas las políticas vigentes.</p>
                )}
                <Link href="/politicas" className="inline-block text-brand-600 hover:underline">Ver todas</Link>
              </div>
            )}
          </section>
        )}

        {(capacitaciones.length > 0 || d?.simulaciones) && (
          <section className="space-y-3">
            <h2>Mis capacitaciones de seguridad</h2>
            <div className="tarjeta space-y-3 p-4 text-sm">
              {capacitaciones.length > 0 && (
                <ul className="divide-y divide-line/[0.06]">
                  {capacitaciones.map((c) => (
                    <li key={c.nombre} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span>{c.nombre}</span>
                      <Estado
                        ok={c.estado === 'al_dia'}
                        texto={c.estado === 'al_dia' ? `Al día${c.vence ? ` hasta el ${soloFecha(c.vence)}` : ''}` : c.estado === 'vencida' ? `Vencida${c.vence ? ` el ${soloFecha(c.vence)}` : ''}` : 'Pendiente'}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {capPendientes.length > 0 && (
                <p className="text-ink/70">
                  {urlCapacitaciones
                    ? <><a href={urlCapacitaciones} target="_blank" rel="noopener" className="text-brand-600 underline">Hacelas acá</a>. </>
                    : 'Ciberseguridad te va a mandar la invitación para hacerlas. '}
                  Si ya las hiciste, puede tardar unos días en reflejarse.
                </p>
              )}
              {d?.simulaciones && (
                <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-ink/80">
                  Simulacros de phishing: recibiste {d.simulaciones.recibidas}
                  {d.simulaciones.reporto > 0 ? `, reportaste ${d.simulaciones.reporto}` : ''}
                  {d.simulaciones.clic > 0 ? ` y en ${d.simulaciones.clic} hiciste clic` : ''}.
                  {d.simulaciones.clic > 0 ? ' Ante la duda, usá el botón “Reportar phishing”: es la mejor defensa.' : d.simulaciones.reporto > 0 ? ' ¡Muy bien!' : ''}
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      {d && <p className="text-xs text-ink/45">Datos de equipos, licencias y cuenta tomados del inventario de la empresa. Si algo no coincide, avisanos con un pedido.</p>}
    </div>
  )
}
