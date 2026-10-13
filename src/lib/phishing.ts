import 'server-only'
import { admin } from './supabase/admin'
import { enviarEmail } from './avisos'
import { APP_URL } from './formato'
import { crearTicket, registrarEvento, subirAdjuntos } from './tickets'
import { analizarCorreo, informe, type Analisis } from './phishing-analisis'
import type { Canal, Prioridad } from './tipos'

// Reporte de phishing: crea el ticket para Ciberseguridad con el análisis automático como nota interna
// y le dice a la persona qué hacer según lo que haya llegado a hacer con el correo.

export const MAX_CORREO = 3_500_000 // el límite de las acciones del servidor es 4 MB

export const CLIC = [
  { valor: 'no', texto: 'No, solo lo vi' },
  { valor: 'clic', texto: 'Hice clic en un enlace' },
  { valor: 'contrasena', texto: 'Ingresé mi usuario o contraseña' },
  { valor: 'adjunto', texto: 'Abrí un adjunto' },
] as const
export type Clic = (typeof CLIC)[number]['valor']
export const esClic = (v: unknown): v is Clic => CLIC.some((c) => c.valor === v)

/** Qué tiene que hacer la persona ahora, según lo que hizo con el correo. */
export function queHacer(clic: Clic): string[] {
  switch (clic) {
    case 'contrasena':
      return [
        'Cambiá tu contraseña ahora mismo desde https://aka.ms/sspr (o pedinos ayuda respondiendo este pedido).',
        'Si usás esa misma contraseña en otro sitio, cambiala también.',
        'Revisá que la verificación en dos pasos esté activa: https://aka.ms/mfasetup',
        'Ciberseguridad va a revisar los ingresos a tu cuenta y te va a contactar.',
      ]
    case 'adjunto':
      return [
        'Desconectá el equipo de la red (Wi-Fi o cable), pero no lo apagues: nos sirve para revisarlo.',
        'No abras otros archivos ni conectes pendrives.',
        'Ciberseguridad te va a contactar enseguida.',
      ]
    case 'clic':
      return [
        'Cerrá la página que se abrió y no completes nada.',
        'Si la página te pidió usuario o contraseña y los ingresaste, cambiá tu contraseña desde https://aka.ms/sspr y avisanos en este pedido.',
        'No descargues ni abras nada de ese sitio.',
      ]
    default:
      return ['No hagas clic en los enlaces ni respondas el correo.', 'Ya podés borrarlo. Te avisamos qué era cuando lo revisemos.']
  }
}

/** Dominios de la empresa: los de las organizaciones + PHISHING_DOMINIOS. Sirven para detectar suplantación. */
async function dominiosPropios(emailReporta: string) {
  const extra = (process.env.PHISHING_DOMINIOS || 'accusys.com.ar,accusystechnology.com').split(',')
  const { data } = await admin().from('organizaciones').select('dominios').eq('activo', true)
  const orgs = (data ?? []).flatMap((o) => String(o.dominios || '').split(','))
  return [...new Set([...extra, ...orgs, emailReporta.split('@')[1] ?? ''].map((d) => d.trim().toLowerCase()).filter((d) => d.includes('.')))]
}

/** Consulta de reputación en VirusTotal (opcional: solo si está VIRUSTOTAL_API_KEY). No se envía nada nuevo, solo se busca. */
async function reputacion(a: Analisis): Promise<string[]> {
  const clave = process.env.VIRUSTOTAL_API_KEY
  if (!clave) return []
  const consultas: { etiqueta: string; ruta: string }[] = [
    ...a.adjuntos.slice(0, 2).map((x) => ({ etiqueta: `Adjunto ${x.nombre}`, ruta: `files/${x.sha256}` })),
    ...[...a.enlaces.filter((e) => e.motivos.length), ...a.enlaces.filter((e) => !e.motivos.length)]
      .slice(0, 4 - Math.min(2, a.adjuntos.length))
      .map((e) => ({ etiqueta: e.dominio, ruta: `urls/${Buffer.from(e.url).toString('base64url')}` })),
  ]
  const salida: string[] = []
  await Promise.all(
    consultas.map(async (c) => {
      try {
        const r = await fetch(`https://www.virustotal.com/api/v3/${c.ruta}`, { headers: { 'x-apikey': clave }, signal: AbortSignal.timeout(6000), cache: 'no-store' })
        if (r.status === 404) return salida.push(`${c.etiqueta}: sin antecedentes`)
        if (!r.ok) return
        const j = (await r.json()) as { data?: { attributes?: { last_analysis_stats?: Record<string, number> } } }
        const s = j.data?.attributes?.last_analysis_stats
        if (!s) return
        const total = Object.values(s).reduce((n, v) => n + v, 0)
        salida.push(`${c.etiqueta}: ${s.malicious ?? 0} motores lo marcan como malicioso y ${s.suspicious ?? 0} como sospechoso (de ${total})`)
      } catch {
        /* sin respuesta: se sigue sin reputación */
      }
    }),
  )
  return salida
}

/** Un .msg de Outlook es binario: se rescatan el texto y los enlaces que se puedan leer. */
function textoDeMsg(b: Buffer) {
  const utf16 = b.toString('utf16le').replace(/[^\x20-\x7E -ɏ\n]+/g, ' ')
  const latin = b.toString('latin1').replace(/[^\x20-\x7E -ÿ\n]+/g, ' ')
  const enlaces = [...new Set(`${utf16}\n${latin}`.match(/https?:\/\/[^\s"'<>)\]]{4,300}/g) ?? [])].slice(0, 40)
  return enlaces.join('\n')
}

export async function crearReportePhishing(r: {
  solicitanteId: string | null
  email: string
  nombre: string
  canal: Canal
  remitente?: string
  asunto?: string
  texto?: string
  comentario?: string
  hizoClic: Clic
  archivo?: File | null
}) {
  const db = admin()
  const { data: cat } = await db.from('categorias').select('id').eq('nombre', 'Reporte de phishing').maybeSingle()

  let eml: string | null = null
  let extraTexto = r.texto ?? ''
  const archivo = r.archivo && r.archivo.size > 0 && r.archivo.size <= MAX_CORREO ? r.archivo : null
  if (archivo) {
    const b = Buffer.from(await archivo.arrayBuffer())
    if (/\.msg$/i.test(archivo.name) || b.subarray(0, 4).toString('hex') === 'd0cf11e0') extraTexto += '\n' + textoDeMsg(b)
    else eml = b.toString('latin1')
  }

  const a = analizarCorreo(eml, { remitente: r.remitente, asunto: r.asunto, texto: extraTexto }, await dominiosPropios(r.email))
  const rep = await reputacion(a)
  const malicioso = rep.some((x) => /: [1-9]\d* motores/.test(x))

  // Otros reportes del mismo remitente en la última semana: puede ser una campaña.
  const desde = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count: otros } = a.remitente
    ? await db.from('phishing_analisis').select('ticket_id', { count: 'exact', head: true }).eq('remitente', a.remitente).gte('creado_en', desde)
    : { count: 0 }

  const comprometido = r.hizoClic !== 'no'
  const prioridad: Prioridad = comprometido ? 'urgente' : a.nivel === 'alto' || malicioso ? 'alta' : 'media'
  const clicTexto = CLIC.find((c) => c.valor === r.hizoClic)!.texto
  const resumen = a.asunto || r.asunto || a.remitente || r.remitente || 'correo sospechoso'

  const t = await crearTicket({
    asunto: `Phishing reportado: ${resumen}`.slice(0, 200),
    descripcion: [
      r.comentario?.trim() || 'Reporto un correo sospechoso.',
      '',
      `¿Hice algo con el correo? ${clicTexto}`,
      archivo ? `Adjunto el correo original (${archivo.name}).` : 'No adjunté el correo original.',
      !archivo && r.texto?.trim() ? `\nTexto del correo:\n${r.texto.trim().slice(0, 8000)}` : '',
    ].join('\n'),
    canal: r.canal,
    solicitanteId: r.solicitanteId,
    email: r.email,
    nombre: r.nombre,
    categoriaId: cat?.id ?? null,
    prioridad,
    sinIA: true,
    avisarSolicitante: false,
    datos: [
      { etiqueta: 'Remitente sospechoso', valor: a.remitente || r.remitente || '' },
      { etiqueta: '¿Hizo algo con el correo?', valor: clicTexto },
      { etiqueta: 'Riesgo según el análisis', valor: `${a.nivel} (${a.puntaje}/100)` },
    ].filter((d) => d.valor),
  })

  if (archivo) await subirAdjuntos(t.id, null, [archivo])
  const nota = [
    informe(a, rep),
    otros ? `\n⚠ Hay ${otros} ${otros === 1 ? 'otro reporte' : 'otros reportes'} del mismo remitente en los últimos 7 días: puede ser una campaña.` : '',
    comprometido ? `\n⚠ La persona indicó: ${clicTexto.toLowerCase()}. Revisar ingresos a la cuenta y el equipo.` : '',
  ].join('')
  await Promise.all([
    db.from('mensajes').insert({ ticket_id: t.id, autor_id: null, autor_nombre: 'Análisis automático', de_staff: true, interno: true, cuerpo: nota.slice(0, 20000) }),
    db.from('phishing_analisis').insert({
      ticket_id: t.id,
      puntaje: a.puntaje,
      nivel: a.nivel,
      remitente: a.remitente || (r.remitente ?? '').toLowerCase().slice(0, 200),
      dominio: a.dominio,
      asunto: a.asunto,
      spf: a.spf,
      dkim: a.dkim,
      dmarc: a.dmarc,
      indicadores: a.indicadores,
      enlaces: a.enlaces,
      adjuntos: a.adjuntos,
      hizo_clic: r.hizoClic,
      con_archivo: !!archivo,
    }),
  ])
  if (comprometido) await registrarEvento(t.id, 'Sistema', `Prioridad urgente: la persona indicó "${clicTexto.toLowerCase()}"`)

  if (r.email.includes('@')) {
    await enviarEmail(
      r.email,
      `[#${t.numero}] Recibimos tu reporte de phishing`,
      [
        `Hola ${r.nombre.split(' ')[0] || ''}, gracias por avisar: reportar es la mejor defensa.`,
        '',
        'Ahora:',
        ...queHacer(r.hizoClic).map((x) => `- ${x}`),
        '',
        `Seguí el reporte en ${APP_URL}/tickets/${t.id}`,
      ].join('\n'),
    )
  }
  return { ticket: t, analisis: a }
}
