// Análisis preliminar de un correo reportado como phishing.
// Sin dependencias: lee el .eml (cabeceras, partes MIME, enlaces y adjuntos) y suma indicadores.
// Es una ayuda para Ciberseguridad: la decisión final la toma una persona.

import { createHash } from 'node:crypto'

export interface Indicador { texto: string; peso: number }
export interface Enlace { url: string; dominio: string; texto: string; motivos: string[] }
export interface AdjuntoMail { nombre: string; tipo: string; tamano: number; sha256: string; riesgoso: boolean }
export interface Analisis {
  puntaje: number
  nivel: 'bajo' | 'medio' | 'alto'
  remitente: string
  nombreRemitente: string
  dominio: string
  responderA: string
  asunto: string
  fecha: string
  spf: string | null
  dkim: string | null
  dmarc: string | null
  indicadores: Indicador[]
  enlaces: Enlace[]
  adjuntos: AdjuntoMail[]
  conCabeceras: boolean
}

// ---------- Lectura del .eml ----------

type Cabeceras = Map<string, string[]>
interface Parte { cab: Cabeceras; cuerpo: Buffer }

function leerCabeceras(texto: string): Cabeceras {
  const cab: Cabeceras = new Map()
  const lineas = texto.replace(/\r\n/g, '\n').split('\n')
  let actual = ''
  const guardar = () => {
    const i = actual.indexOf(':')
    if (i > 0) {
      const k = actual.slice(0, i).trim().toLowerCase()
      cab.set(k, [...(cab.get(k) ?? []), actual.slice(i + 1).trim()])
    }
  }
  for (const l of lineas) {
    if (/^[ \t]/.test(l)) actual += ' ' + l.trim()
    else { if (actual) guardar(); actual = l }
  }
  if (actual) guardar()
  return cab
}

const primera = (c: Cabeceras, k: string) => c.get(k)?.[0] ?? ''

function decodificarPalabras(s: string) {
  // =?utf-8?B?...?= y =?iso-8859-1?Q?...?=
  return s.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, cs: string, enc: string, txt: string) => {
    try {
      const bytes = enc.toUpperCase() === 'B'
        ? Buffer.from(txt, 'base64')
        : Buffer.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))), 'binary')
      return new TextDecoder(cs.toLowerCase() === 'utf8' ? 'utf-8' : cs).decode(bytes)
    } catch {
      return txt
    }
  }).replace(/\?=\s+=\?/g, '?==?')
}

function parametro(valor: string, nombre: string) {
  const m = valor.match(new RegExp(`${nombre}\\*?=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i'))
  return m ? decodificarPalabras(m[1] ?? m[2] ?? '') : ''
}

function decodificarCuerpo(cuerpo: string, codificacion: string): Buffer {
  const c = codificacion.toLowerCase()
  if (c.includes('base64')) return Buffer.from(cuerpo.replace(/\s+/g, ''), 'base64')
  if (c.includes('quoted-printable')) {
    const t = cuerpo.replace(/=\r?\n/g, '')
    const bytes: number[] = []
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2 }
      else bytes.push(t.charCodeAt(i) & 0xff)
    }
    return Buffer.from(bytes)
  }
  return Buffer.from(cuerpo, 'binary')
}

function texto(b: Buffer, ct: string) {
  const cs = parametro(ct, 'charset') || 'utf-8'
  try { return new TextDecoder(cs).decode(b) } catch { return b.toString('utf8') }
}

function partes(crudo: string, profundidad = 0): Parte[] {
  const sep = crudo.search(/\r?\n\r?\n/)
  const cab = leerCabeceras(sep >= 0 ? crudo.slice(0, sep) : crudo)
  const cuerpo = sep >= 0 ? crudo.slice(sep).replace(/^\r?\n\r?\n/, '') : ''
  const ct = primera(cab, 'content-type')
  const borde = parametro(ct, 'boundary')
  if (/^multipart\//i.test(ct) && borde && profundidad < 6) {
    return cuerpo.split(`--${borde}`).slice(1)
      .filter((p) => !p.startsWith('--'))
      .flatMap((p) => partes(p.replace(/^\r?\n/, ''), profundidad + 1))
  }
  return [{ cab, cuerpo: decodificarCuerpo(cuerpo, primera(cab, 'content-transfer-encoding')) }]
}

// ---------- Indicadores ----------

const ACORTADORES = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|rb\.gy|tiny\.cc|s\.id|t\.ly)$/i
const HOSTING_GRATIS = /(\.|^)(pages\.dev|workers\.dev|r2\.dev|web\.app|firebaseapp\.com|glitch\.me|ngrok(-free)?\.(io|app)|blogspot\.com|sites\.google\.com|weebly\.com|wixsite\.com|000webhostapp\.com|netlify\.app|vercel\.app|github\.io|godaddysites\.com|square\.site|webflow\.io|formstack\.com|jotform\.com|typeform\.com|forms\.gle|ipfs\.io|dweb\.link)$/i
const EXT_RIESGOSA = /\.(html?|shtml|svg|iso|img|vhd|zip|rar|7z|gz|exe|scr|com|bat|cmd|ps1|js|jse|vbs|vbe|wsf|lnk|hta|msi|docm|xlsm|pptm|xlam|one|jar)$/i
const URGENCIA = /(urgente|inmediat|suspend|bloquead|verific|confirm[áa] tu|contraseñ|password|credencial|venc(e|id)|últim[oa] aviso|pago pendiente|factura|transferencia|premio|ganaste|reembolso|actualiz[áa] tus datos|iniciar sesi[oó]n|sign in|account)/gi

const dominioDe = (correo: string) => (correo.split('@')[1] ?? '').toLowerCase().replace(/>$/, '')
// Dominio registrable: accusys.com.ar (no com.ar), accusystechnology.com
const base = (d: string) => {
  const p = d.toLowerCase().split('.')
  const n = p.length >= 3 && p.at(-1)!.length === 2 && /^(com|net|org|gob|gov|edu|co|ac|mil|int)$/.test(p.at(-2)!) ? 3 : 2
  return p.slice(-n).join('.')
}

function distancia(a: string, b: string) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[m][n]
}
const normalizarParecido = (d: string) => d.replace(/0/g, 'o').replace(/[1l|]/g, 'i').replace(/rn/g, 'm').replace(/vv/g, 'w')

function resultadoAuth(cab: Cabeceras, mecanismo: 'spf' | 'dkim' | 'dmarc') {
  const fuentes = [...(cab.get('authentication-results') ?? []), ...(cab.get('arc-authentication-results') ?? [])]
  for (const f of fuentes) {
    const m = f.match(new RegExp(`\\b${mecanismo}=(pass|fail|softfail|neutral|none|temperror|permerror|bestguesspass)`, 'i'))
    if (m) return m[1].toLowerCase()
  }
  if (mecanismo === 'spf') {
    const r = primera(cab, 'received-spf').match(/^(pass|fail|softfail|neutral|none)/i)
    if (r) return r[1].toLowerCase()
  }
  return null
}

function extraerEnlaces(html: string, plano: string) {
  const vistos = new Map<string, Enlace>()
  const agregar = (url: string, visible: string) => {
    url = url.replace(/&amp;/g, '&').trim()
    if (!/^https?:\/\//i.test(url) || vistos.size >= 40) return
    let dominio = ''
    try { dominio = new URL(url).hostname.toLowerCase() } catch { return }
    if (!vistos.has(url)) vistos.set(url, { url: url.slice(0, 500), dominio, texto: visible.slice(0, 120), motivos: [] })
  }
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    agregar(m[1], m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  }
  for (const m of `${plano}\n${html.replace(/<a\b[\s\S]*?<\/a>/gi, ' ').replace(/<[^>]+>/g, ' ')}`.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) agregar(m[0].replace(/[.,;]+$/, ''), '')
  return [...vistos.values()]
}

/**
 * @param eml     contenido del .eml (si la persona lo adjuntó)
 * @param extra   lo que cargó a mano: remitente, asunto y el texto pegado
 * @param propios dominios de la empresa (para detectar suplantación y dominios parecidos)
 */
export function analizarCorreo(eml: string | null, extra: { remitente?: string; asunto?: string; texto?: string }, propios: string[]): Analisis {
  const ind: Indicador[] = []
  const sumar = (texto: string, peso: number) => { if (!ind.some((i) => i.texto === texto)) ind.push({ texto, peso }) }
  let cab: Cabeceras = new Map()
  let html = '', plano = extra.texto ?? ''
  const adjuntos: AdjuntoMail[] = []

  if (eml) {
    const todas = partes(eml)
    const sep = eml.search(/\r?\n\r?\n/)
    cab = leerCabeceras(sep >= 0 ? eml.slice(0, sep) : eml)
    for (const p of todas) {
      const ct = primera(p.cab, 'content-type') || 'text/plain'
      const disp = primera(p.cab, 'content-disposition')
      const nombre = parametro(disp, 'filename') || parametro(ct, 'name')
      if (nombre || /attachment/i.test(disp)) {
        adjuntos.push({
          nombre: nombre || '(sin nombre)', tipo: ct.split(';')[0].trim(), tamano: p.cuerpo.length,
          sha256: createHash('sha256').update(p.cuerpo).digest('hex'),
          riesgoso: EXT_RIESGOSA.test(nombre) || /\.\w{2,4}\.(exe|scr|js|html?)$/i.test(nombre),
        })
      } else if (/text\/html/i.test(ct)) html += texto(p.cuerpo, ct)
      else if (/text\/plain/i.test(ct)) plano += '\n' + texto(p.cuerpo, ct)
    }
  }

  const deCab = decodificarPalabras(primera(cab, 'from'))
  const from = deCab || extra.remitente || ''
  const remitente = (from.match(/<([^>]+)>/)?.[1] ?? from.match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? '').toLowerCase()
  const nombreRemitente = from.replace(/<[^>]+>/, '').replace(/"/g, '').replace(/[^\s<>"]+@[^\s<>"]+/g, '').trim()
  const dominio = dominioDe(remitente)
  const responderA = (decodificarPalabras(primera(cab, 'reply-to')).match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? '').toLowerCase()
  const retorno = (primera(cab, 'return-path').match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? '').toLowerCase()
  const asunto = decodificarPalabras(primera(cab, 'subject')) || extra.asunto || ''
  const spf = resultadoAuth(cab, 'spf'), dkim = resultadoAuth(cab, 'dkim'), dmarc = resultadoAuth(cab, 'dmarc')
  const propiosBase = propios.map((d) => base(d.toLowerCase())).filter(Boolean)
  const esPropio = (d: string) => propiosBase.includes(base(d))

  // Autenticación del remitente
  if (dmarc === 'fail') sumar('DMARC falló: el correo no está autorizado por el dominio que dice ser', 30)
  if (spf === 'fail') sumar('SPF falló: el servidor que lo envió no está autorizado por ese dominio', 15)
  else if (spf === 'softfail') sumar('SPF dudoso (softfail)', 8)
  if (dkim === 'fail') sumar('La firma DKIM no es válida', 10)

  // Suplantación
  if (dominio && !esPropio(dominio)) {
    const enNombre = propiosBase.find((p) => p.split('.')[0].length >= 4 && nombreRemitente.toLowerCase().includes(p.split('.')[0]))
    if (enNombre) sumar(`El nombre del remitente menciona a la empresa, pero escribe desde un dominio externo (${dominio})`, 25)
    const parecido = propiosBase.find((p) => {
      const a = normalizarParecido(base(dominio)), b = normalizarParecido(p)
      return a !== p && (a === b || distancia(base(dominio), p) <= 2)
    })
    if (parecido) sumar(`Dominio parecido al de la empresa: ${dominio} (se parece a ${parecido})`, 30)
  }
  if (responderA && dominio && base(dominioDe(responderA)) !== base(dominio)) sumar(`Las respuestas van a otro dominio (${dominioDe(responderA)})`, 15)
  if (retorno && dominio && base(dominioDe(retorno)) !== base(dominio)) sumar(`El remitente técnico es de otro dominio (${dominioDe(retorno)})`, 5)
  if (/xn--/i.test(dominio)) sumar('El dominio del remitente usa caracteres especiales para parecerse a otro (punycode)', 20)

  // Enlaces
  const enlaces = extraerEnlaces(html, plano)
  for (const e of enlaces) {
    const visible = e.texto.match(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)?.[1]?.toLowerCase()
    if (visible && base(visible) !== base(e.dominio) && /\./.test(visible)) e.motivos.push(`dice ${visible} pero lleva a ${e.dominio}`)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(e.dominio)) e.motivos.push('lleva a una dirección IP')
    if (ACORTADORES.test(e.dominio)) e.motivos.push('acortador de enlaces')
    if (/xn--/i.test(e.dominio)) e.motivos.push('dominio con caracteres especiales')
    if (HOSTING_GRATIS.test(e.dominio)) e.motivos.push('sitio en un hosting gratuito')
    if (!esPropio(e.dominio) && /login|signin|verify|account|password|secure|update|webmail|office|microsoft|outlook/i.test(e.url) && !/(^|\.)(microsoft|office|live|microsoftonline)\.com$/i.test(e.dominio))
      e.motivos.push('pide iniciar sesión o datos de cuenta fuera de un sitio oficial')
  }
  const malos = enlaces.filter((e) => e.motivos.length)
  if (malos.some((e) => e.motivos.some((m) => m.startsWith('dice ')))) sumar('Hay enlaces que muestran una dirección y llevan a otra', 20)
  if (malos.some((e) => e.motivos.some((m) => /IP|caracteres especiales/.test(m)))) sumar('Hay enlaces a direcciones IP o con caracteres especiales', 15)
  if (malos.some((e) => e.motivos.some((m) => /acortador|hosting/.test(m)))) sumar('Hay enlaces acortados o a sitios en hosting gratuito', 10)
  if (malos.some((e) => e.motivos.some((m) => /iniciar sesión/.test(m)))) sumar('Pide iniciar sesión o datos de cuenta en un sitio que no es oficial', 15)

  // Adjuntos
  if (adjuntos.some((a) => a.riesgoso)) sumar(`Adjunto de un tipo que se usa para ataques: ${adjuntos.filter((a) => a.riesgoso).map((a) => a.nombre).join(', ')}`, 25)

  // Lenguaje de urgencia o de credenciales
  const palabras = new Set(`${asunto} ${plano} ${html.replace(/<[^>]+>/g, ' ')}`.toLowerCase().match(URGENCIA) ?? [])
  if (palabras.size >= 2) sumar(`Usa lenguaje de urgencia o de credenciales (${[...palabras].slice(0, 4).join(', ')})`, 10)

  const puntaje = Math.min(100, ind.reduce((n, i) => n + i.peso, 0))
  return {
    puntaje,
    nivel: puntaje >= 50 ? 'alto' : puntaje >= 25 ? 'medio' : 'bajo',
    remitente, nombreRemitente, dominio, responderA, asunto: asunto.slice(0, 300),
    fecha: primera(cab, 'date'),
    spf, dkim, dmarc,
    indicadores: ind.sort((a, b) => b.peso - a.peso),
    enlaces: enlaces.sort((a, b) => b.motivos.length - a.motivos.length).slice(0, 25),
    adjuntos,
    conCabeceras: cab.size > 0,
  }
}

/** Texto del análisis para la nota interna del ticket. */
export function informe(a: Analisis, reputacion: string[] = []) {
  const l: string[] = []
  l.push(`Análisis automático: riesgo ${a.nivel.toUpperCase()} (${a.puntaje}/100)${a.conCabeceras ? '' : ' — sin el .eml no se pudieron revisar las cabeceras'}`)
  l.push('')
  l.push(`Remitente: ${a.nombreRemitente ? `${a.nombreRemitente} ` : ''}<${a.remitente || 'desconocido'}>`)
  if (a.responderA) l.push(`Responder a: ${a.responderA}`)
  if (a.asunto) l.push(`Asunto: ${a.asunto}`)
  if (a.conCabeceras) l.push(`SPF: ${a.spf ?? 'sin dato'} · DKIM: ${a.dkim ?? 'sin dato'} · DMARC: ${a.dmarc ?? 'sin dato'}`)
  l.push('')
  l.push(a.indicadores.length ? 'Indicadores:' : 'No se encontraron indicadores automáticos (revisar igual a mano).')
  for (const i of a.indicadores) l.push(`- ${i.texto}`)
  const malos = a.enlaces.filter((e) => e.motivos.length)
  if (a.enlaces.length) {
    l.push('')
    l.push(`Enlaces (${a.enlaces.length}${malos.length ? `, ${malos.length} sospechosos` : ''}):`)
    for (const e of a.enlaces.slice(0, 10)) l.push(`- ${e.url.replace(/^https?:\/\//, 'hxxp://')}${e.motivos.length ? ` → ${e.motivos.join('; ')}` : ''}`)
  }
  if (a.adjuntos.length) {
    l.push('')
    l.push('Adjuntos:')
    for (const x of a.adjuntos) l.push(`- ${x.nombre} (${x.tipo}, ${Math.round(x.tamano / 1024)} KB)${x.riesgoso ? ' ⚠ tipo riesgoso' : ''} · SHA-256 ${x.sha256}`)
  }
  if (reputacion.length) {
    l.push('')
    l.push('Reputación (VirusTotal):')
    for (const r of reputacion) l.push(`- ${r}`)
  }
  l.push('')
  l.push('Para cerrar el reporte, usá las respuestas predefinidas "Phishing: confirmado", "Phishing: correo legítimo" o "Phishing: spam o publicidad".')
  return l.join('\n')
}
