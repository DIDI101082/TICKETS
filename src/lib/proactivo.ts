import 'server-only'
import { admin } from './supabase/admin'
import { crearTicket, registrarEvento } from './tickets'
import { avisarPersona } from './notificar'
import { guardarConfig, leerConfig } from './config'
import { cyberConfigurado } from './cyber'
import type { Prioridad } from './tipos'

// Soporte proactivo: Accusys Cyber detecta problemas en los equipos asignados (no se conecta, disco lleno,
// antivirus apagado, reinicio pendiente, disco sin cifrar, amenazas de ESET) y acá se abre el ticket
// a nombre de la persona, con un aviso que le explica qué pasa. Cuando el problema desaparece, el ticket se resuelve solo.

export type TipoProactivo = 'sin_reporte' | 'disco' | 'antivirus' | 'reinicio' | 'cifrado' | 'eset'

export interface Problema {
  tipo: TipoProactivo
  clave: string
  detalle: string
  email: string
  nombre: string
  equipo: string
  hostname: string | null
  equipo_id: string
}

export interface ConfigProactivo {
  activo: boolean
  dias_sin_reporte: number
  disco_pct: number
  tipos: Record<TipoProactivo, { activo: boolean; sector_id: string | null }>
  ultima?: string
  ultimo_error?: string | null
  ultimo_resultado?: { abiertos: number; resueltos: number; detectados: number }
}

export const TIPOS: Record<TipoProactivo, { nombre: string; sector: string; prioridad: Prioridad; asunto: string; paraLaPersona: string }> = {
  sin_reporte: {
    nombre: 'Equipo que no se conecta', sector: 'CAU', prioridad: 'baja',
    asunto: 'Tu equipo {equipo} no se conecta hace varios días',
    paraLaPersona: 'Detectamos que tu equipo {equipo} no se conecta a la red de la empresa. {detalle}.\n\nSi lo estás usando, conectalo a la red de la oficina o a la VPN para que reciba las actualizaciones de seguridad. Si lo guardaste o ya no lo usás, respondé este mensaje y lo registramos.',
  },
  disco: {
    nombre: 'Disco casi lleno', sector: 'CAU', prioridad: 'media',
    asunto: 'Tu equipo {equipo} se está quedando sin espacio',
    paraLaPersona: 'Detectamos que tu equipo {equipo} se está quedando sin espacio. {detalle}.\n\nPodés liberar lugar vaciando la papelera y borrando descargas que ya no uses. Si necesitás ayuda, respondé este mensaje. Cuando haya espacio suficiente, este pedido se cierra solo.',
  },
  antivirus: {
    nombre: 'Antivirus apagado', sector: 'Ciberseguridad', prioridad: 'alta',
    asunto: 'El antivirus de tu equipo {equipo} está apagado',
    paraLaPersona: 'Detectamos que el antivirus de tu equipo {equipo} está apagado. El equipo de Ciberseguridad ya lo está revisando.\n\nMientras tanto, evitá abrir archivos o enlaces que no esperabas.',
  },
  reinicio: {
    nombre: 'Reinicio pendiente', sector: 'CAU', prioridad: 'baja',
    asunto: 'Tu equipo {equipo} necesita reiniciarse',
    paraLaPersona: 'Tu equipo {equipo} tiene actualizaciones de seguridad esperando un reinicio. {detalle}.\n\nGuardá tu trabajo y reinicialo cuando puedas. No hace falta que respondas: este pedido se cierra solo después del reinicio.',
  },
  cifrado: {
    nombre: 'Disco sin cifrar', sector: 'Ciberseguridad', prioridad: 'media',
    asunto: 'El disco de tu equipo {equipo} no está cifrado',
    paraLaPersona: 'Detectamos que el disco de tu equipo {equipo} no está protegido con cifrado. Si el equipo se pierde, la información quedaría expuesta.\n\nEl equipo de Ciberseguridad se va a contactar para activarlo. No hace falta que hagas nada por ahora.',
  },
  eset: {
    nombre: 'Amenaza detectada por ESET', sector: 'Ciberseguridad', prioridad: 'alta',
    asunto: 'El antivirus detectó una amenaza en tu equipo {equipo}',
    paraLaPersona: 'El antivirus detectó una amenaza en tu equipo {equipo}. El equipo de Ciberseguridad ya lo está revisando y se va a contactar.\n\nNo apagues el equipo y evitá abrir archivos o enlaces desconocidos hasta que te contacten.',
  },
}

export const CONFIG_INICIAL: ConfigProactivo = {
  activo: false,
  dias_sin_reporte: 7,
  disco_pct: 10,
  tipos: Object.fromEntries(Object.keys(TIPOS).map((t) => [t, { activo: true, sector_id: null }])) as ConfigProactivo['tipos'],
}

export async function leerProactivo(): Promise<ConfigProactivo> {
  const c = await leerConfig<ConfigProactivo>('proactivo', CONFIG_INICIAL)
  return { ...CONFIG_INICIAL, ...c, tipos: { ...CONFIG_INICIAL.tipos, ...(c.tipos ?? {}) } }
}

const llenar = (t: string, p: Problema) => t.split('{equipo}').join(p.equipo || p.hostname || '').split('{detalle}').join(p.detalle)
const CLAVE = (p: Problema) => `proactivo:${p.clave}`.slice(0, 200)

/** Lo que Accusys Cyber detecta hoy. Devuelve null si no se pudo consultar (para no resolver tickets por error). */
export async function problemasActuales(c?: ConfigProactivo): Promise<{ lista: Problema[] | null; error?: string }> {
  if (!cyberConfigurado()) return { lista: null, error: 'Falta configurar la conexión con Accusys Cyber' }
  const conf = c ?? (await leerProactivo())
  const base = process.env.CYBER_SUPABASE_URL!.replace(/\/$/, '')
  const anon = process.env.CYBER_SUPABASE_ANON_KEY!
  try {
    const r = await fetch(`${base}/rest/v1/rpc/tickets_problemas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: anon, ...(anon.startsWith('eyJ') ? { authorization: `Bearer ${anon}` } : {}) },
      body: JSON.stringify({ p_token: process.env.CYBER_CONTEXTO_TOKEN, p_dias_sin_reporte: conf.dias_sin_reporte, p_disco_pct: conf.disco_pct }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => '')
      if (/PGRST202|Could not find the function/i.test(cuerpo) || r.status === 404) return { lista: null, error: 'Falta ejecutar tickets-proactivo.sql en Accusys Cyber' }
      return { lista: null, error: `Accusys Cyber respondió ${r.status}` }
    }
    const j = await r.json()
    return { lista: Array.isArray(j) ? (j as Problema[]).filter((p) => p && p.tipo in TIPOS && p.email) : [] }
  } catch {
    return { lista: null, error: 'Accusys Cyber no respondió a tiempo' }
  }
}

/** Revisión: abre los tickets nuevos y resuelve los que ya no corresponden. */
export async function revisarProactivo(forzar = false) {
  const conf = await leerProactivo()
  const res = { abiertos: 0, resueltos: 0, detectados: 0 }
  if (!conf.activo) return res
  // Cada 6 horas como mucho (salvo "Revisar ahora")
  if (!forzar && conf.ultima && Date.now() - new Date(conf.ultima).getTime() < 6 * 3600000) return res

  const { lista, error } = await problemasActuales(conf)
  if (!lista) {
    await guardarConfig('proactivo', { ...conf, ultima: new Date().toISOString(), ultimo_error: error ?? 'Error desconocido' })
    return res
  }
  res.detectados = lista.length
  const db = admin()
  const { data: sectores } = await db.from('sectores').select('id,nombre').eq('activo', true)
  const sectorDe = (t: TipoProactivo) =>
    conf.tipos[t]?.sector_id ?? (sectores ?? []).find((s) => String(s.nombre).toLowerCase() === TIPOS[t].sector.toLowerCase())?.id ?? null

  const { data: abiertos } = await db.from('tickets').select('id,numero,asunto,clave_externa,solicitante_id,solicitante_email,beneficiario_id').like('clave_externa', 'proactivo:%').in('estado', ['abierto', 'en_curso', 'en_espera']).is('eliminado_en', null)
  const desde = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: recientes } = await db.from('tickets').select('clave_externa').like('clave_externa', 'proactivo:%').gte('resuelto_en', desde)
  const yaAbierto = new Set((abiertos ?? []).map((t) => t.clave_externa as string))
  const reciente = new Set((recientes ?? []).map((t) => t.clave_externa as string))
  const vigentes = new Set(lista.map(CLAVE))

  // 1. Nuevos problemas → ticket a nombre de la persona (como mucho 25 por revisión)
  for (const p of lista) {
    if (res.abiertos >= 25) break
    const tipo = TIPOS[p.tipo]
    if (!conf.tipos[p.tipo]?.activo) continue
    const clave = CLAVE(p)
    if (yaAbierto.has(clave) || reciente.has(clave)) continue
    const { data: persona } = await db.from('perfiles').select('id,nombre').eq('email', p.email).eq('activo', true).maybeSingle()
    const cyber = (process.env.NEXT_PUBLIC_CYBER_URL || '').replace(/\/$/, '')
    const t = await crearTicket({
      asunto: llenar(tipo.asunto, p).slice(0, 200),
      descripcion: [
        `Detectado automáticamente por Accusys Cyber: ${tipo.nombre.toLowerCase()}.`,
        '',
        `Persona: ${p.nombre || p.email} (${p.email})`,
        `Equipo: ${p.equipo}${p.hostname && p.hostname !== p.equipo ? ` (${p.hostname})` : ''}`,
        `Detalle: ${p.detalle}`,
        ...(cyber ? [`Ficha del equipo: ${cyber}/inventario/equipos/${p.equipo_id}`] : []),
        '',
        'Si el problema se corrige, este ticket se resuelve solo en la próxima revisión.',
      ].join('\n'),
      canal: 'monitoreo',
      solicitanteId: persona?.id ?? null,
      email: p.email,
      nombre: (persona?.nombre as string) || p.nombre || p.email,
      sectorId: sectorDe(p.tipo),
      prioridad: tipo.prioridad,
      sinIA: true,
      avisarSolicitante: false,
      claveExterna: clave,
    })
    yaAbierto.add(clave)
    const texto = llenar(tipo.paraLaPersona, p)
    await db.from('mensajes').insert({ ticket_id: t.id, autor_nombre: 'Soporte proactivo', de_staff: true, interno: false, cuerpo: texto })
    await avisarPersona({ perfilId: persona?.id ?? null, email: p.email, ticket: t, tipo: 'respuesta', titulo: 'Detectamos algo en tu equipo', texto })
    res.abiertos++
  }

  // 2. Problemas que ya no aparecen → se resuelven solos
  for (const t of abiertos ?? []) {
    if (vigentes.has(t.clave_externa as string)) continue
    await db.from('mensajes').insert({ ticket_id: t.id, autor_nombre: 'Soporte proactivo', de_staff: true, interno: false, cuerpo: 'La revisión automática ya no detecta este problema, así que damos el pedido por resuelto. Si seguís teniendo inconvenientes, respondé este mensaje y lo retomamos.' })
    const { error: e } = await db.from('tickets').update({ estado: 'resuelto' }).eq('id', t.id)
    if (!e) {
      await registrarEvento(t.id as string, 'Soporte proactivo', 'Resuelto automáticamente: Accusys Cyber ya no detecta el problema')
      res.resueltos++
    }
  }

  await guardarConfig('proactivo', { ...conf, ultima: new Date().toISOString(), ultimo_error: null, ultimo_resultado: res })
  return res
}
