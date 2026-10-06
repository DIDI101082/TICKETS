import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'
import { iaDisponible } from '@/lib/ia'
import { claves, coincidencias, rellenar } from '@/lib/texto'
import { fecha, slaRespuesta, slaResolucion, tamano } from '@/lib/formato'
import { InsigniaEstado, InsigniaPrioridad, TextoSla } from '@/components/Insignias'
import { ESTADOS, PRIORIDADES, etiquetaImpacto, etiquetaUrgencia, type Adjunto, type Mensaje, type Sector, type Ticket } from '@/lib/tipos'
import Pasos from '@/components/Pasos'
import Respuesta from './Respuesta'
import { agregarSeguidor, quitarSeguidor, reabrir, actualizar, calificar, cerrarPropio, decidirAprobacion, desvincular, fusionar, generarResumen, pedirAprobacion, tomar, vincular } from './acciones'

function Adjuntos({ lista }: { lista: Adjunto[] }) {
  if (!lista.length) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {lista.map((a) => (
        <li key={a.id}>
          <a href={`/api/adjuntos/${a.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md border border-line/10 bg-surface px-2 py-1 text-xs hover:border-brand-500">
            <span className="max-w-[14rem] truncate">{a.nombre}</span>
            <span className="text-ink/40">{tamano(a.tamano)}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

type Mini = { id: string; numero: number; asunto: string; estado: string }

function ListaTickets({ lista }: { lista: Mini[] }) {
  return (
    <ul className="space-y-1.5">
      {lista.map((x) => (
        <li key={x.id} className="flex items-baseline gap-2">
          <Link href={`/tickets/${x.id}`} className="min-w-0 flex-1 truncate hover:text-brand-600 hover:underline">
            <span className="text-ink/45">#{x.numero}</span> {x.asunto}
          </Link>
          <InsigniaEstado estado={x.estado} />
        </li>
      ))}
    </ul>
  )
}

const APROBACION: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'Aprobación pendiente', clase: 'bg-amber-500/10 text-amber-700' },
  aprobado: { texto: 'Aprobado', clase: 'bg-emerald-50 text-emerald-700' },
  rechazado: { texto: 'Rechazado', clase: 'bg-red-50 text-red-700' },
}

export default async function Detalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db, perfil, staff, esAdmin } = await sesion()

  const { data } = await db.from('tickets').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const t = data as Ticket
  // Al abrir el ticket se dan por leídas sus notificaciones.
  await admin().from('notificaciones').update({ leida: true }).eq('perfil_id', perfil.id).eq('ticket_id', id).eq('leida', false)
  if (staff) await auditar(perfil, 'Vio ticket', 'ticket', `#${t.numero}`, t.confidencial ? 'Confidencial' : '')

  const nada = Promise.resolve({ data: [] as never[] })
  const [rm, ra, rs, rp, re, rpl, rh, rsim, req, racc] = await Promise.all([
    db.from('mensajes').select('*').eq('ticket_id', id).order('creado_en'),
    db.from('adjuntos').select('id,ticket_id,mensaje_id,nombre,tamano').eq('ticket_id', id).order('creado_en'),
    db.from('sectores').select('*').order('orden'),
    staff ? db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']).order('nombre') : nada,
    staff ? db.from('eventos').select('*').eq('ticket_id', id).order('creado_en', { ascending: false }).limit(40) : nada,
    staff ? db.from('plantillas').select('id,titulo,cuerpo').order('titulo') : nada,
    db.from('tickets').select('id,numero,asunto,estado').eq('padre_id', id).order('numero'),
    staff ? db.from('tickets').select('id,numero,asunto,estado').in('estado', ['resuelto', 'cerrado']).neq('id', id).order('creado_en', { ascending: false }).limit(400) : nada,
    staff && t.equipo ? db.from('tickets').select('id,numero,asunto,estado').eq('equipo', t.equipo).neq('id', id).order('creado_en', { ascending: false }).limit(10) : nada,
    staff ? db.from('ticket_acceso').select('perfil_id').eq('ticket_id', id) : nada,
  ])
  const mensajes = (rm.data ?? []) as Mensaje[]
  const adjuntos = (ra.data ?? []) as Adjunto[]
  const sectores = (rs.data ?? []) as Sector[]
  const agentes = (rp.data ?? []) as { id: string; nombre: string; email: string }[]
  const eventos = (re.data ?? []) as { id: string; autor_nombre: string; detalle: string; creado_en: string }[]
  const hijos = (rh.data ?? []) as Mini[]
  const delEquipo = (req.data ?? []) as Mini[]
  const accesos = new Set(((racc.data ?? []) as { perfil_id: string }[]).map((a) => a.perfil_id))

  const mias = claves(t.asunto)
  const parecidos = ((rsim.data ?? []) as Mini[])
    .map((x) => ({ ...x, puntos: coincidencias(mias, claves(x.asunto)) }))
    .filter((x) => x.puntos >= Math.min(2, mias.length) && x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 5)

  const [rcat, rorg, rpadre, rfus, rapr] = await Promise.all([
    t.categoria_id ? db.from('categorias').select('nombre').eq('id', t.categoria_id).maybeSingle() : Promise.resolve({ data: null }),
    t.organizacion_id ? db.from('organizaciones').select('nombre').eq('id', t.organizacion_id).maybeSingle() : Promise.resolve({ data: null }),
    t.padre_id ? db.from('tickets').select('id,numero,asunto,estado').eq('id', t.padre_id).maybeSingle() : Promise.resolve({ data: null }),
    t.fusionado_en_id ? db.from('tickets').select('id,numero,asunto,estado').eq('id', t.fusionado_en_id).maybeSingle() : Promise.resolve({ data: null }),
    t.aprobador_id && staff ? db.from('perfiles').select('nombre,email').eq('id', t.aprobador_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  // Personas en copia: los nombres se leen del lado del servidor porque un usuario no puede ver perfiles ajenos.
  const { data: seg } = await db.from('ticket_seguidores').select('perfil_id').eq('ticket_id', id)
  const idsCopia = (seg ?? []).map((x) => x.perfil_id as string)
  const { data: enCopia } = idsCopia.length ? await admin().from('perfiles').select('id,nombre,email').in('id', idsCopia) : { data: [] }
  const seguidores = (enCopia ?? []) as { id: string; nombre: string; email: string }[]
  const padre = rpadre.data as Mini | null
  const fusion = rfus.data as Mini | null

  const sector = sectores.find((s) => s.id === t.sector_id)
  const esPropio = t.solicitante_id === perfil.id || t.beneficiario_id === perfil.id
  const ultimo = mensajes.filter((m) => !m.interno).at(-1)
  const esperaAlUsuario = t.estado === 'en_espera' && t.aprobacion_estado !== 'pendiente' && !!ultimo?.de_staff
  const esAprobador = t.aprobador_id === perfil.id
  const puedeResponder = !t.fusionado_en_id && (staff || t.estado !== 'cerrado')
  const terminado = t.estado === 'resuelto' || t.estado === 'cerrado'
  const plantillas = ((rpl.data ?? []) as { id: string; titulo: string; cuerpo: string }[]).map((p) => ({
    ...p,
    cuerpo: rellenar(p.cuerpo, { nombre: (t.solicitante_nombre || '').split(' ')[0], numero: String(t.numero), asunto: t.asunto }),
  }))
  const cyber = (process.env.NEXT_PUBLIC_CYBER_URL || '').replace(/\/$/, '')
  const apr = APROBACION[t.aprobacion_estado]

  return (
    <div className="space-y-5">
      <div>
        <Link href={staff ? '/agente' : '/portal'} className="text-sm text-ink/50 hover:text-ink">
          ← Volver
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink/45">#{t.numero}</span>
          <InsigniaEstado estado={t.estado} />
          {staff && <InsigniaPrioridad prioridad={t.prioridad} />}
          {apr && <span className={`pill ${apr.clase}`}>{apr.texto}</span>}
          {t.confidencial && <span className="pill bg-violet-50 text-violet-700">Confidencial</span>}
          {staff && t.incidente && <span className="pill bg-red-50 text-red-700">Posible incidente</span>}
          {staff && t.escalado_en && <span className="pill bg-orange-50 text-orange-700">Escalado</span>}
        </div>
        <h1 className="mt-1">{t.asunto}</h1>
        <p className="mt-1 text-sm text-ink/55">
          {t.solicitante_nombre || t.solicitante_email}
          {rorg.data ? ` (${rorg.data.nombre})` : ''} · {fecha(t.creado_en)} · por {t.canal}
          {rcat.data ? ` · ${rcat.data.nombre}` : ''}
          {!staff && sector ? ` · lo atiende ${sector.nombre}` : ''}
        </p>
        {(t.beneficiario_nombre || (staff && (t.impacto || t.urgencia))) && (
          <p className="mt-0.5 text-sm text-ink/55">
            {t.beneficiario_nombre && <>Pedido para <span className="text-ink/80">{t.beneficiario_nombre}</span></>}
            {staff && t.impacto && <>{t.beneficiario_nombre ? ' · ' : ''}Afecta: {etiquetaImpacto(t.impacto).toLowerCase()}</>}
            {staff && t.urgencia && <> · {etiquetaUrgencia(t.urgencia)}</>}
          </p>
        )}
      </div>

      {!staff && !fusion && (
        <div className="tarjeta space-y-3 p-4">
          <Pasos t={t} />
          {esperaAlUsuario && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              Estamos esperando tu respuesta para seguir. Leé el último mensaje y contestá más abajo.
            </p>
          )}
          {t.aprobacion_estado === 'pendiente' && !esAprobador && (
            <p className="text-sm text-ink/65">El pedido está esperando la aprobación de un responsable. Te avisamos apenas decida.</p>
          )}
          {!terminado && !esperaAlUsuario && t.aprobacion_estado !== 'pendiente' && (
            <p className="text-sm text-ink/65">
              {!t.primera_respuesta_en && t.vence_respuesta
                ? <>Te respondemos antes del <strong className="text-ink">{fecha(t.vence_respuesta)}</strong>.</>
                : t.vence_resolucion && t.estado !== 'en_espera'
                  ? <>Estimamos resolverlo antes del <strong className="text-ink">{fecha(t.vence_resolucion)}</strong>.</>
                  : null}
            </p>
          )}
        </div>
      )}

      {fusion && (
        <p className="tarjeta p-4 text-sm">
          Este ticket se fusionó en{' '}
          <Link href={`/tickets/${fusion.id}`} className="font-medium text-brand-600 underline">#{fusion.numero} {fusion.asunto}</Link>. La conversación sigue ahí.
        </p>
      )}

      {esAprobador && t.aprobacion_estado === 'pendiente' && (
        <form action={decidirAprobacion.bind(null, t.id)} className="tarjeta space-y-3 border-brand-500 p-4">
          <h2>Este pedido necesita tu aprobación</h2>
          <textarea name="nota" rows={2} className="campo" placeholder="Comentario (opcional)" />
          <div className="flex gap-2">
            <button name="decision" value="aprobado" className="btn">Aprobar</button>
            <button name="decision" value="rechazado" className="btn-sec">Rechazar</button>
          </div>
        </form>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-3">
          <article className="tarjeta p-4">
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
            <Adjuntos lista={adjuntos.filter((a) => !a.mensaje_id)} />
          </article>

          {mensajes.map((m) => (
            <article
              key={m.id}
              className={`rounded-xl border p-4 ${
                m.interno ? 'border-amber-300 bg-amber-50' : m.de_staff ? 'border-brand-500/25 bg-brand-50/60' : 'border-line/10 bg-surface'
              }`}
            >
              <header className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs text-ink/55">
                <span className="text-sm font-medium text-ink">{m.autor_nombre || 'Sin nombre'}</span>
                {m.interno ? <span className="font-medium text-amber-800">Nota interna</span> : m.de_staff ? <span>Soporte</span> : null}
                <span>{fecha(m.creado_en)}</span>
              </header>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.cuerpo}</p>
              <Adjuntos lista={adjuntos.filter((a) => a.mensaje_id === m.id)} />
            </article>
          ))}

          {puedeResponder ? (
            <Respuesta ticketId={t.id} staff={staff} plantillas={plantillas} ia={staff && iaDisponible()} />
          ) : (
            !fusion && (
              <p className="tarjeta p-4 text-sm text-ink/60">
                Este ticket está cerrado. Si el problema continúa, <Link href="/portal/nuevo" className="text-brand-600 underline">cargá uno nuevo</Link>.
              </p>
            )
          )}

          {terminado && !fusion && (t.csat_puntaje || esPropio) && (
            <div id="encuesta" className="tarjeta p-4">
              {t.csat_puntaje ? (
                <p className="text-sm">
                  <span className="font-medium">Calificación de la atención: {t.csat_puntaje} de 5.</span>
                  {t.csat_comentario && <span className="text-ink/65"> “{t.csat_comentario}”</span>}
                </p>
              ) : (
                <form action={calificar.bind(null, t.id)} className="space-y-3">
                  <h2>¿Cómo te atendimos?</h2>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Puntaje de 1 a 5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="cursor-pointer">
                        <input type="radio" name="puntaje" value={n} required className="peer sr-only" />
                        <span className="grid h-10 w-10 place-items-center rounded-lg border border-line/10 bg-surface text-sm font-medium peer-checked:border-brand-500 peer-checked:bg-brand-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40">
                          {n}
                        </span>
                      </label>
                    ))}
                    <span className="self-center text-xs text-ink/50">1 = muy mal · 5 = excelente</span>
                  </div>
                  <textarea name="comentario" rows={2} className="campo" placeholder="¿Querés contarnos algo más? (opcional)" />
                  <button className="btn">Enviar calificación</button>
                </form>
              )}
            </div>
          )}

          {!staff && esPropio && !fusion && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {terminado ? (
                <form action={reabrir.bind(null, t.id)}>
                  <button className="btn-sec">El problema sigue: reabrir</button>
                </form>
              ) : (
                <form action={cerrarPropio.bind(null, t.id)}>
                  <button className="text-ink/55 underline-offset-2 hover:text-ink hover:underline">Ya está resuelto, cerrar el ticket</button>
                </form>
              )}
              <Link href={`/portal/nuevo?desde=${t.id}`} className="text-ink/55 underline-offset-2 hover:text-ink hover:underline">
                Cargar otro pedido igual
              </Link>
            </div>
          )}

          {!staff && (seguidores.length > 0 || (esPropio && !fusion)) && (
            <div className="tarjeta space-y-2 p-4 text-sm">
              <h2>Personas en copia</h2>
              {seguidores.length === 0 && <p className="text-ink/60">Podés sumar a un compañero para que siga el pedido y pueda comentar.</p>}
              <ul className="space-y-1">
                {seguidores.map((sg) => (
                  <li key={sg.id} className="flex items-center justify-between gap-2">
                    <span>{sg.nombre || sg.email}</span>
                    {(t.solicitante_id === perfil.id || sg.id === perfil.id) && (
                      <form action={quitarSeguidor.bind(null, t.id, sg.id)}>
                        <button className="text-xs text-ink/50 hover:text-red-700">{sg.id === perfil.id ? 'Dejar de seguir' : 'Quitar'}</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {esPropio && !fusion && (
                <form action={agregarSeguidor.bind(null, t.id)} className="flex gap-2 pt-1">
                  <input name="email" type="email" required placeholder="Mail de la persona" className="campo" />
                  <button className="btn-sec shrink-0 px-3">Agregar</button>
                </form>
              )}
            </div>
          )}

          {!staff && (padre || hijos.length > 0) && (
            <div className="tarjeta p-4 text-sm">
              <h2 className="mb-2">Tickets relacionados</h2>
              <ListaTickets lista={[...(padre ? [padre] : []), ...hijos]} />
            </div>
          )}
        </section>

        {staff && (
          <aside className="space-y-4">
            <form action={actualizar.bind(null, t.id)} className="tarjeta space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="rotulo" htmlFor="estado">Estado</label>
                  <select id="estado" name="estado" defaultValue={t.estado} className="campo">
                    {ESTADOS.map((e) => (
                      <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="rotulo" htmlFor="prioridad">Prioridad</label>
                  <select id="prioridad" name="prioridad" defaultValue={t.prioridad} className="campo">
                    {PRIORIDADES.map((p) => (
                      <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="rotulo" htmlFor="sector_id">Sector</label>
                <select id="sector_id" name="sector_id" defaultValue={t.sector_id ?? ''} className="campo">
                  <option value="">Sin sector (triage)</option>
                  {sectores.filter((s) => s.activo || s.id === t.sector_id).map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rotulo" htmlFor="asignado_id">Asignado a</label>
                <select id="asignado_id" name="asignado_id" defaultValue={t.asignado_id ?? ''} className="campo">
                  <option value="">Nadie</option>
                  {agentes.map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre || a.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rotulo" htmlFor="equipo">Equipo (n.º de inventario)</label>
                <input id="equipo" name="equipo" defaultValue={t.equipo} className="campo" placeholder="Ej.: NB-0142" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confidencial" defaultChecked={t.confidencial} className="accent-brand-600" />
                Confidencial
              </label>
              {(esAdmin || t.asignado_id === perfil.id) && (
                <details className="text-sm" open={t.confidencial && accesos.size > 0}>
                  <summary className="cursor-pointer text-ink/60">Quién más puede verlo si es confidencial</summary>
                  <input type="hidden" name="con_accesos" value="1" />
                  <div className="mt-2 space-y-1">
                    {agentes.filter((a) => a.id !== t.asignado_id).map((a) => (
                      <label key={a.id} className="flex items-center gap-2">
                        <input type="checkbox" name="acceso" value={a.id} defaultChecked={accesos.has(a.id)} className="accent-brand-600" />
                        {a.nombre || a.email}
                      </label>
                    ))}
                    <p className="pt-1 text-xs text-ink/45">Siempre lo ven el solicitante, quien lo tiene asignado y los administradores.</p>
                  </div>
                </details>
              )}
              {hijos.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="propagar" defaultChecked className="accent-brand-600" />
                  Al resolver o cerrar, aplicar a los {hijos.length} vinculados
                </label>
              )}
              <button className="btn w-full">Guardar cambios</button>
            </form>

            {t.asignado_id !== perfil.id && (
              <form action={tomar.bind(null, t.id)}>
                <button className="btn-sec w-full">Tomar este ticket</button>
              </form>
            )}

            <div className="tarjeta space-y-2 p-4 text-sm">
              <h2>SLA</h2>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink/60">Primera respuesta</span>
                <TextoSla sla={slaRespuesta(t)} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink/60">Resolución</span>
                <TextoSla sla={slaResolucion(t)} />
              </div>
              <p className="pt-1 text-xs text-ink/45">Vence respuesta {fecha(t.vence_respuesta)} · resolución {fecha(t.vence_resolucion)}</p>
            </div>

            <div className="tarjeta space-y-2 p-4 text-sm">
              <h2>Aprobación</h2>
              {t.aprobacion_estado === 'no_requiere' ? (
                <p className="text-ink/60">Este pedido no requiere aprobación.</p>
              ) : (
                <p>
                  <span className={`pill ${apr?.clase}`}>{apr?.texto}</span>{' '}
                  {rapr.data ? <span className="text-ink/65">{rapr.data.nombre || rapr.data.email}</span> : <span className="text-amber-700">Falta designar quién aprueba</span>}
                  {t.aprobacion_en && <span className="text-ink/45"> · {fecha(t.aprobacion_en)}</span>}
                </p>
              )}
              {t.aprobacion_nota && <p className="text-ink/65">“{t.aprobacion_nota}”</p>}
              {t.aprobacion_estado !== 'aprobado' && (
                <form action={pedirAprobacion.bind(null, t.id)} className="flex gap-2 pt-1">
                  <input name="email" type="email" required placeholder="Email de quien aprueba" className="campo" />
                  <button className="btn-sec shrink-0 px-3">Pedir</button>
                </form>
              )}
            </div>

            <div className="tarjeta space-y-2 p-4 text-sm">
              <h2>Personas en copia</h2>
              {seguidores.length === 0 ? (
                <p className="text-ink/60">Nadie en copia.</p>
              ) : (
                <ul className="space-y-1">
                  {seguidores.map((sg) => (
                    <li key={sg.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{sg.nombre || sg.email}</span>
                      <form action={quitarSeguidor.bind(null, t.id, sg.id)}>
                        <button className="text-xs text-ink/50 hover:text-red-700">Quitar</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <form action={agregarSeguidor.bind(null, t.id)} className="flex gap-2 pt-1">
                <input name="email" type="email" required placeholder="Mail de la persona" className="campo" />
                <button className="btn-sec shrink-0 px-3">Agregar</button>
              </form>
            </div>

            <div className="tarjeta space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <h2>Resumen</h2>
                {iaDisponible() && (
                  <form action={generarResumen.bind(null, t.id)}>
                    <button className="text-xs text-brand-600 hover:underline">{t.resumen ? 'Actualizar' : 'Generar con IA'}</button>
                  </form>
                )}
              </div>
              {t.resumen ? (
                <>
                  <p className="whitespace-pre-wrap text-ink/80">{t.resumen}</p>
                  <p className="text-xs text-ink/45">Generado por IA · {fecha(t.resumen_en)}</p>
                </>
              ) : (
                <p className="text-ink/60">{iaDisponible() ? 'Todavía no se generó.' : 'Requiere configurar la clave de IA.'}</p>
              )}
            </div>

            <div className="tarjeta space-y-3 p-4 text-sm">
              <h2>Vínculos</h2>
              {padre && (
                <div>
                  <p className="mb-1 text-xs text-ink/50">Ticket principal</p>
                  <ListaTickets lista={[padre]} />
                  <form action={desvincular.bind(null, t.id)}>
                    <button className="mt-1 text-xs text-ink/55 hover:underline">Desvincular</button>
                  </form>
                </div>
              )}
              {hijos.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-ink/50">Vinculados a este</p>
                  <ListaTickets lista={hijos} />
                </div>
              )}
              {!fusion && (
                <>
                  <form action={vincular.bind(null, t.id)} className="flex gap-2">
                    <input name="numero" inputMode="numeric" required placeholder="N.º del ticket principal" className="campo" />
                    <button className="btn-sec shrink-0 px-3">Vincular</button>
                  </form>
                  <form action={fusionar.bind(null, t.id)} className="flex gap-2">
                    <input name="numero" inputMode="numeric" required placeholder="Fusionar en el n.º…" className="campo" />
                    <button className="btn-sec shrink-0 px-3">Fusionar</button>
                  </form>
                  <p className="text-xs text-ink/45">Fusionar pasa toda la conversación al otro ticket y cierra este. No se puede deshacer.</p>
                </>
              )}
            </div>

            {(t.equipo || delEquipo.length > 0) && (
              <div className="tarjeta space-y-2 p-4 text-sm">
                <h2>Equipo {t.equipo}</h2>
                {cyber && (
                  <a href={`${cyber}/inventario?q=${encodeURIComponent(t.equipo)}`} target="_blank" rel="noopener" className="text-brand-600 hover:underline">
                    Buscarlo en Accusys Cyber
                  </a>
                )}
                {delEquipo.length > 0 ? (
                  <>
                    <p className="text-xs text-ink/50">Otros tickets de este equipo</p>
                    <ListaTickets lista={delEquipo} />
                  </>
                ) : (
                  <p className="text-ink/60">Es el primer ticket de este equipo.</p>
                )}
              </div>
            )}

            {parecidos.length > 0 && (
              <div className="tarjeta space-y-2 p-4 text-sm">
                <h2>Parecidos ya resueltos</h2>
                <ListaTickets lista={parecidos} />
              </div>
            )}

            <div className="tarjeta space-y-1 p-4 text-sm">
              <h2>Derivación</h2>
              {t.ia_sector ? (
                <p>
                  La IA sugirió <strong>{t.ia_sector}</strong>
                  {t.ia_confianza != null && <> con {Math.round(Number(t.ia_confianza) * 100)}% de confianza</>}.
                </p>
              ) : (
                <p className="text-ink/60">Sin sugerencia de IA.</p>
              )}
              {t.ia_motivo && <p className="text-ink/60">{t.ia_motivo}</p>}
            </div>

            {eventos.length > 0 && (
              <div className="tarjeta p-4 text-sm">
                <h2 className="mb-2">Historial</h2>
                <ul className="space-y-2">
                  {eventos.map((e) => (
                    <li key={e.id} className="border-l-2 border-line/10 pl-2.5">
                      <p>{e.detalle}</p>
                      <p className="text-xs text-ink/45">{e.autor_nombre} · {fecha(e.creado_en)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
