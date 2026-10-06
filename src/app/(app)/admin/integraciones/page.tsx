import { exigirAdmin } from '@/lib/auth'
import { leerConfig, leerMails, leerReporte } from '@/lib/config'
import { fecha } from '@/lib/formato'
import { guardarMails } from '../acciones2'
import Pruebas from './Pruebas'

export default async function Integraciones() {
  await exigirAdmin()
  const [mails, reporte, revision] = await Promise.all([leerMails(), leerReporte(), leerConfig<{ en: string }>('ultima_revision', { en: '' })])
  const e = process.env
  const filas: { nombre: string; ok: boolean; detalle: string }[] = [
    { nombre: 'Derivación, borradores y resúmenes con IA', ok: !!e.ANTHROPIC_API_KEY, detalle: e.ANTHROPIC_API_KEY ? `Modelo: ${e.AI_MODEL || 'claude-haiku-4-5-20251001'}` : 'Falta ANTHROPIC_API_KEY' },
    { nombre: 'Envío de mails', ok: !!(e.RESEND_API_KEY && e.EMAIL_FROM), detalle: e.RESEND_API_KEY && e.EMAIL_FROM ? `Remitente: ${e.EMAIL_FROM}` : 'Faltan RESEND_API_KEY y EMAIL_FROM' },
    { nombre: 'Avisos al canal de Teams', ok: !!e.TEAMS_WEBHOOK_URL, detalle: e.TEAMS_WEBHOOK_URL ? 'Configurado' : 'Falta TEAMS_WEBHOOK_URL' },
    { nombre: 'Avisos por Teams a cada persona', ok: !!e.TEAMS_USUARIO_WEBHOOK_URL, detalle: e.TEAMS_USUARIO_WEBHOOK_URL ? 'Configurado' : 'Falta TEAMS_USUARIO_WEBHOOK_URL' },
    { nombre: 'Entrada por email y Teams', ok: (e.ENTRADA_SECRET ?? '').length >= 12, detalle: (e.ENTRADA_SECRET ?? '').length >= 12 ? 'Clave cargada' : 'Falta ENTRADA_SECRET (12 caracteres o más)' },
    { nombre: 'Monitoreo (PRTG)', ok: (e.MONITOREO_SECRET ?? '').length >= 12, detalle: (e.MONITOREO_SECRET ?? '').length >= 12 ? `Sector: ${e.MONITOREO_SECTOR || 'Infraestructura'}` : 'Falta MONITOREO_SECRET (12 caracteres o más)' },
    { nombre: 'Contadores para otra app', ok: (e.RESUMEN_API_KEY ?? '').length >= 12, detalle: (e.RESUMEN_API_KEY ?? '').length >= 12 ? 'Clave cargada' : 'Falta RESUMEN_API_KEY' },
    { nombre: 'Ingreso con Microsoft', ok: e.NEXT_PUBLIC_MICROSOFT === '1', detalle: e.NEXT_PUBLIC_MICROSOFT === '1' ? 'Botón visible (requiere Azure activo en Supabase)' : 'NEXT_PUBLIC_MICROSOFT no está en 1' },
    { nombre: 'Tarea diaria programada', ok: !!e.CRON_SECRET, detalle: e.CRON_SECRET ? 'Clave cargada' : 'Falta CRON_SECRET' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1>Integraciones</h1>
        <p className="text-sm text-ink/60">Qué está configurado y cómo probarlo. Las claves se cargan en Vercel (Settings → Environment Variables) y requieren redesplegar.</p>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Función</th>
              <th>Estado</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td className="font-medium">{f.nombre}</td>
                <td>
                  <span className={`pill ${f.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-line/[0.05] text-ink/55'}`}>{f.ok ? 'Configurada' : 'Sin configurar'}</span>
                </td>
                <td className="text-ink/65">{f.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line/[0.06] px-4 py-3 text-sm text-ink/65">
          Última revisión automática (avisos de SLA, escalamiento, programados y mantenimiento): <strong className="text-ink">{revision.en ? fecha(revision.en) : 'todavía no corrió'}</strong>
        </p>
      </div>

      <section className="tarjeta space-y-3 p-4">
        <h2>Probar</h2>
        <p className="text-sm text-ink/60">“Configurada” solo dice que la clave está cargada. Estas pruebas hacen una llamada real.</p>
        <Pruebas />
      </section>

      <form action={guardarMails} className="tarjeta space-y-4 p-4">
        <h2>Textos de los mails y reporte mensual</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="firma">Firma</label>
            <textarea id="firma" name="firma" rows={3} defaultValue={mails.firma} placeholder={'Mesa de Ayuda\nAccusys Technology'} className="campo" />
            <p className="mt-1 text-xs text-ink/45">Va al final de cada mail que manda el sistema. Vacía, se usa el nombre de la app.</p>
          </div>
          <div>
            <label className="rotulo" htmlFor="pie">Pie</label>
            <textarea id="pie" name="pie" rows={3} defaultValue={mails.pie} placeholder="Horario de atención, teléfono de guardia, aviso de confidencialidad…" className="campo" />
          </div>
        </div>
        <div>
          <label className="rotulo" htmlFor="destinatarios">Enviar el reporte mensual a</label>
          <input id="destinatarios" name="destinatarios" defaultValue={reporte.destinatarios} placeholder="mails separados por coma" className="campo" />
          <p className="mt-1 text-xs text-ink/45">Sale a principio de cada mes, con los números del mes anterior. Necesita el envío de mails configurado.</p>
        </div>
        <button className="btn-sec">Guardar</button>
      </form>
    </div>
  )
}
