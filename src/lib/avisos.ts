import 'server-only'
import { APP_NOMBRE } from './formato'

/** Publica una tarjeta en un canal de Teams (webhook de Workflows). No hace nada si no está configurado. */
export async function avisarTeams(titulo: string, lineas: string[], url?: string): Promise<boolean> {
  const destino = process.env.TEAMS_WEBHOOK_URL
  if (!destino) return false
  try {
    const r = await fetch(destino, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [
                { type: 'TextBlock', text: titulo, weight: 'Bolder', size: 'Medium', wrap: true },
                ...lineas.map((l) => ({ type: 'TextBlock', text: l, wrap: true, spacing: 'Small' })),
              ],
              actions: url ? [{ type: 'Action.OpenUrl', title: 'Abrir ticket', url }] : [],
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    })
    return r.ok
  } catch (e) {
    console.error('Aviso a Teams falló:', e)
    return false
  }
}

/** Envía un email por Resend. No hace nada si no está configurado. */
export async function enviarEmail(para: string, asunto: string, texto: string): Promise<boolean> {
  const clave = process.env.RESEND_API_KEY
  const desde = process.env.EMAIL_FROM
  if (!clave || !desde || !para) return false
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        from: desde,
        to: [para],
        subject: asunto,
        text: `${texto}\n\n— ${APP_NOMBRE}`,
        ...(process.env.EMAIL_SOPORTE ? { reply_to: process.env.EMAIL_SOPORTE } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    })
    return r.ok
  } catch (e) {
    console.error('Envío de email falló:', e)
    return false
  }
}

/**
 * Mensaje directo por Teams a una persona. Requiere un flujo de Power Automate
 * ("Cuando se recibe una solicitud HTTP" -> "Publicar mensaje en un chat", destinatario = email)
 * cuya dirección va en TEAMS_USUARIO_WEBHOOK_URL. Sin esa variable no hace nada.
 */
export async function avisarTeamsPersona(email: string, titulo: string, texto: string, url: string): Promise<boolean> {
  const destino = process.env.TEAMS_USUARIO_WEBHOOK_URL
  if (!destino || !email.includes('@')) return false
  try {
    const r = await fetch(destino, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, titulo, texto: texto.slice(0, 1500), url }),
      signal: AbortSignal.timeout(10000),
    })
    return r.ok
  } catch (e) {
    console.error('Aviso por Teams a la persona falló:', e)
    return false
  }
}
