import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { fecha, slaRespuesta, slaResolucion, tamano } from '@/lib/formato'
import { InsigniaEstado, InsigniaPrioridad, TextoSla } from '@/components/Insignias'
import { ESTADOS, PRIORIDADES, type Adjunto, type Mensaje, type Sector, type Ticket } from '@/lib/tipos'
import { actualizar, cerrarPropio, responder, tomar } from './acciones'

function Adjuntos({ lista }: { lista: Adjunto[] }) {
  if (!lista.length) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {lista.map((a) => (
        <li key={a.id}>
          <a href={`/api/adjuntos/${a.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-2 py-1 text-xs hover:border-marca">
            <span className="max-w-[14rem] truncate">{a.nombre}</span>
            <span className="text-black/40">{tamano(a.tamano)}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export default async function Detalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db, perfil, staff } = await sesion()

  const { data } = await db.from('tickets').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const t = data as Ticket

  const [rm, ra, rs, rp, re] = await Promise.all([
    db.from('mensajes').select('*').eq('ticket_id', id).order('creado_en'),
    db.from('adjuntos').select('id,ticket_id,mensaje_id,nombre,tamano').eq('ticket_id', id).order('creado_en'),
    db.from('sectores').select('*').order('orden'),
    staff ? db.from('perfiles').select('id,nombre,email').in('rol', ['admin', 'agente']).order('nombre') : Promise.resolve({ data: [] }),
    staff ? db.from('eventos').select('*').eq('ticket_id', id).order('creado_en', { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
  ])
  const mensajes = (rm.data ?? []) as Mensaje[]
  const adjuntos = (ra.data ?? []) as Adjunto[]
  const sectores = (rs.data ?? []) as Sector[]
  const agentes = (rp.data ?? []) as { id: string; nombre: string; email: string }[]
  const eventos = (re.data ?? []) as { id: string; autor_nombre: string; detalle: string; creado_en: string }[]

  const sector = sectores.find((s) => s.id === t.sector_id)
  const esPropio = t.solicitante_id === perfil.id
  const puedeResponder = staff || t.estado !== 'cerrado'

  return (
    <div className="space-y-5">
      <div>
        <Link href={staff ? '/agente' : '/portal'} className="text-sm text-black/50 hover:text-tinta">
          ← Volver
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-black/45">#{t.numero}</span>
          <InsigniaEstado estado={t.estado} />
          {staff && <InsigniaPrioridad prioridad={t.prioridad} />}
        </div>
        <h1 className="mt-1">{t.asunto}</h1>
        <p className="mt-1 text-sm text-black/55">
          {t.solicitante_nombre || t.solicitante_email} · {fecha(t.creado_en)} · por {t.canal}
          {!staff && sector ? ` · lo atiende ${sector.nombre}` : ''}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="space-y-3">
          <article className="tarjeta p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.descripcion}</p>
            <Adjuntos lista={adjuntos.filter((a) => !a.mensaje_id)} />
          </article>

          {mensajes.map((m) => (
            <article
              key={m.id}
              className={`rounded-lg border p-4 ${
                m.interno ? 'border-amber-300 bg-amber-50' : m.de_staff ? 'border-marca/25 bg-marca-claro/60' : 'border-black/10 bg-white'
              }`}
            >
              <header className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs text-black/55">
                <span className="text-sm font-medium text-tinta">{m.autor_nombre || 'Sin nombre'}</span>
                {m.interno ? <span className="font-medium text-amber-800">Nota interna</span> : m.de_staff ? <span>Soporte</span> : null}
                <span>{fecha(m.creado_en)}</span>
              </header>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.cuerpo}</p>
              <Adjuntos lista={adjuntos.filter((a) => a.mensaje_id === m.id)} />
            </article>
          ))}

          {puedeResponder ? (
            <form action={responder.bind(null, t.id)} className="tarjeta space-y-3 p-4">
              <label className="rotulo" htmlFor="cuerpo">Responder</label>
              <textarea id="cuerpo" name="cuerpo" rows={5} className="campo" placeholder="Escribí tu respuesta…" />
              <input name="archivos" type="file" multiple className="block w-full text-sm text-black/70 file:mr-3 file:rounded-md file:border-0 file:bg-black/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-medium" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button className="btn">Enviar</button>
                {staff && (
                  <>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="interno" className="accent-marca" /> Nota interna (no la ve el solicitante)
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      Después de enviar:
                      <select name="estado_tras" className="campo w-auto py-1" defaultValue="">
                        <option value="">dejar en curso</option>
                        <option value="en_espera">pasar a En espera</option>
                        <option value="resuelto">marcar Resuelto</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
            </form>
          ) : (
            <p className="tarjeta p-4 text-sm text-black/60">
              Este ticket está cerrado. Si el problema continúa, <Link href="/portal/nuevo" className="text-marca underline">cargá uno nuevo</Link>.
            </p>
          )}

          {!staff && esPropio && t.estado !== 'cerrado' && (
            <form action={cerrarPropio.bind(null, t.id)}>
              <button className="text-sm text-black/55 underline-offset-2 hover:text-tinta hover:underline">
                Ya está resuelto, cerrar el ticket
              </button>
            </form>
          )}
        </section>

        {staff && (
          <aside className="space-y-4">
            <form action={actualizar.bind(null, t.id)} className="tarjeta space-y-3 p-4">
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
                <span className="text-black/60">Primera respuesta</span>
                <TextoSla sla={slaRespuesta(t)} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-black/60">Resolución</span>
                <TextoSla sla={slaResolucion(t)} />
              </div>
              <p className="pt-1 text-xs text-black/45">
                Vence respuesta {fecha(t.vence_respuesta)} · resolución {fecha(t.vence_resolucion)}
              </p>
            </div>

            <div className="tarjeta space-y-1 p-4 text-sm">
              <h2>Derivación por IA</h2>
              {t.ia_sector ? (
                <p>
                  Sugirió <strong>{t.ia_sector}</strong>
                  {t.ia_confianza != null && <> con {Math.round(Number(t.ia_confianza) * 100)}% de confianza</>}
                  {!t.sector_id && ' (no alcanzó el umbral, quedó en triage)'}.
                </p>
              ) : (
                <p className="text-black/60">Sin sugerencia.</p>
              )}
              {t.ia_motivo && <p className="text-black/60">{t.ia_motivo}</p>}
            </div>

            {eventos.length > 0 && (
              <div className="tarjeta p-4 text-sm">
                <h2 className="mb-2">Historial</h2>
                <ul className="space-y-2">
                  {eventos.map((e) => (
                    <li key={e.id} className="border-l-2 border-black/10 pl-2.5">
                      <p>{e.detalle}</p>
                      <p className="text-xs text-black/45">{e.autor_nombre} · {fecha(e.creado_en)}</p>
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
