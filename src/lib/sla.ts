import 'server-only'
import { admin } from './supabase/admin'
import { avisarTeams, enviarEmail } from './avisos'
import { crearTicket, registrarEvento } from './tickets'
import { guardarConfig, leerConfig, leerOpciones } from './config'
import { APP_URL, slaRespuesta, slaResolucion } from './formato'
import { etiquetaPrioridad, type Ticket } from './tipos'
import { indicadores } from './metricas'
import { duracion } from './formato'

// Minutos de anticipación con los que se avisa que un SLA está por vencer.
const ANTICIPO = 30
const ZONA = process.env.NEXT_PUBLIC_ZONA_HORARIA || 'America/Argentina/Buenos_Aires'

const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())

function siguiente(fecha: string, frecuencia: string, hoy: string) {
  const d = new Date(`${fecha}T12:00:00Z`)
  for (let i = 0; i < 400; i++) {
    if (frecuencia === 'diaria') d.setUTCDate(d.getUTCDate() + 1)
    else if (frecuencia === 'mensual') d.setUTCMonth(d.getUTCMonth() + 1)
    else d.setUTCDate(d.getUTCDate() + 7)
    if (d.toISOString().slice(0, 10) > hoy) break
  }
  return d.toISOString().slice(0, 10)
}

/** Revisión periódica: avisos de SLA, escalamiento y tickets programados. */
export async function revisar() {
  const db = admin()
  const ahora = Date.now()
  const limite = new Date(ahora + ANTICIPO * 60000).toISOString()
  const { data: sectores } = await db.from('sectores').select('id,nombre,responsable_id')
  const sector = new Map((sectores ?? []).map((s) => [s.id as string, s]))
  const resultado = { avisos: 0, escalados: 0, programados: 0, resumenes: 0 }

  // 1. Avisos de SLA por vencer o vencido
  const [resp, resol] = await Promise.all([
    db.from('tickets').select('*').in('estado', ['abierto', 'en_curso']).is('primera_respuesta_en', null).eq('alerta_respuesta', false).lt('vence_respuesta', limite).limit(50),
    db.from('tickets').select('*').in('estado', ['abierto', 'en_curso']).eq('alerta_resolucion', false).lt('vence_resolucion', limite).limit(50),
  ])
  const avisar = async (t: Ticket, tipo: 'respuesta' | 'resolucion') => {
    const sla = tipo === 'respuesta' ? slaRespuesta(t) : slaResolucion(t)
    const ok = await avisarTeams(
      `SLA de ${tipo === 'respuesta' ? 'primera respuesta' : 'resolución'} · #${t.numero} ${t.confidencial ? '(confidencial)' : t.asunto}`,
      [`${sla.texto} · Prioridad ${etiquetaPrioridad(t.prioridad)} · ${t.sector_id ? sector.get(t.sector_id)?.nombre : 'Triage'}`],
      `${APP_URL}/tickets/${t.id}`,
    )
    // Solo se marca como avisado si el aviso salió; si no, se reintenta en la próxima revisión.
    if (ok) {
      await db.from('tickets').update({ [tipo === 'respuesta' ? 'alerta_respuesta' : 'alerta_resolucion']: true }).eq('id', t.id)
      resultado.avisos++
    }
  }
  for (const t of (resp.data ?? []) as Ticket[]) await avisar(t, 'respuesta')
  for (const t of (resol.data ?? []) as Ticket[]) await avisar(t, 'resolucion')

  // 2. Escalamiento: SLA vencido o ticket que nadie tomó
  const op = await leerOpciones()
  const iso = new Date(ahora).toISOString()
  // Las fechas van entre comillas para que los puntos y los dos puntos no confundan al filtro.
  const filtros = [`vence_resolucion.lt."${iso}"`, `and(primera_respuesta_en.is.null,vence_respuesta.lt."${iso}")`]
  if (op.escalar_sin_tomar_min > 0) {
    filtros.push(`and(asignado_id.is.null,creado_en.lt."${new Date(ahora - op.escalar_sin_tomar_min * 60000).toISOString()}")`)
  }
  const { data: aEscalar } = await db.from('tickets').select('*').in('estado', ['abierto', 'en_curso']).is('escalado_en', null).or(filtros.join(',')).limit(50)

  for (const t of (aEscalar ?? []) as Ticket[]) {
    const s = t.sector_id ? sector.get(t.sector_id) : null
    const responsableId = (s?.responsable_id as string | null) ?? null
    const vencido =
      (t.vence_resolucion && new Date(t.vence_resolucion).getTime() < ahora) ||
      (!t.primera_respuesta_en && t.vence_respuesta && new Date(t.vence_respuesta).getTime() < ahora)
    const motivo = vencido ? 'SLA vencido' : `sin asignar hace más de ${op.escalar_sin_tomar_min} minutos`

    await db.from('tickets').update({ escalado_en: iso, ...(!t.asignado_id && responsableId ? { asignado_id: responsableId } : {}) }).eq('id', t.id)

    let aQuien = 'sin responsable de sector definido'
    if (responsableId) {
      const { data: r } = await db.from('perfiles').select('nombre,email').eq('id', responsableId).maybeSingle()
      if (r) {
        aQuien = `responsable: ${r.nombre || r.email}`
        await enviarEmail(
          r.email,
          `[#${t.numero}] Ticket escalado: ${t.confidencial ? '(confidencial)' : t.asunto}`,
          `El ticket #${t.numero} se escaló (${motivo}).\n\nSector: ${s?.nombre ?? 'Triage'} · Prioridad: ${etiquetaPrioridad(t.prioridad)}\n${APP_URL}/tickets/${t.id}`,
        )
      }
    }
    await registrarEvento(t.id, 'Sistema', `Escalado (${motivo}); ${aQuien}`)
    await avisarTeams(`Ticket escalado · #${t.numero} ${t.confidencial ? '(confidencial)' : t.asunto}`, [`Motivo: ${motivo} · ${s?.nombre ?? 'Triage'} · ${aQuien}`], `${APP_URL}/tickets/${t.id}`)
    resultado.escalados++
  }

  // 3. Tickets programados que vencen hoy
  const hoy = hoyLocal()
  const { data: prog } = await db.from('programados').select('*').eq('activo', true).lte('proxima', hoy).limit(50)
  for (const p of prog ?? []) {
    // Primero se corre la fecha: si la creación falla no se generan duplicados en la próxima revisión.
    const { data: tomado } = await db
      .from('programados')
      .update({ ultima: hoy, proxima: siguiente(p.proxima, p.frecuencia, hoy) })
      .eq('id', p.id)
      .eq('proxima', p.proxima)
      .select('id')
    if (!tomado?.length) continue
    await crearTicket({
      asunto: p.asunto,
      descripcion: p.descripcion || 'Tarea programada.',
      canal: 'programado',
      email: '',
      nombre: 'Tarea programada',
      sectorId: p.sector_id,
      prioridad: p.prioridad,
      sinIA: true,
      avisarSolicitante: false,
    })
    resultado.programados++
  }

  // 4. Resumen mensual para el referente de cada organización (una vez por mes, sobre el mes anterior)
  const mesActual = hoy.slice(0, 7)
  const hecho = await leerConfig<{ mes: string }>('ultimo_resumen', { mes: '' })
  if (hecho.mes !== mesActual) {
    await guardarConfig('ultimo_resumen', { mes: mesActual })
    // La primera vez solo se deja registrado el mes, para no mandar un resumen al instalar.
    if (hecho.mes) resultado.resumenes = await enviarResumenes(mesActual)
  }

  return resultado
}

async function enviarResumenes(mesActual: string) {
  const db = admin()
  const [a, m] = mesActual.split('-').map(Number)
  const inicio = new Date(Date.UTC(a, m - 2, 1, 3)).toISOString()
  const fin = new Date(Date.UTC(a, m - 1, 1, 3)).toISOString()
  const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 2, 15)))

  const { data: referentes } = await db.from('perfiles').select('email,nombre,organizacion_id').eq('ve_organizacion', true).not('organizacion_id', 'is', null)
  const { data: orgs } = await db.from('organizaciones').select('id,nombre')
  let enviados = 0
  for (const org of orgs ?? []) {
    const destinatarios = (referentes ?? []).filter((r) => r.organizacion_id === org.id)
    if (!destinatarios.length) continue
    // Los tickets confidenciales no entran en el resumen: el referente tampoco los ve en la app.
    const { data } = await db.from('tickets').select('*').eq('organizacion_id', org.id).eq('confidencial', false).is('fusionado_en_id', null).gte('creado_en', inicio).lt('creado_en', fin)
    const tickets = (data ?? []) as Ticket[]
    if (!tickets.length) continue
    const i = indicadores(org.nombre, tickets)
    const texto = [
      `Resumen de ${nombreMes} para ${org.nombre}:`,
      '',
      `Pedidos cargados: ${i.creados}`,
      `Resueltos: ${i.resueltos}`,
      `Todavía abiertos: ${tickets.filter((t) => !t.resuelto_en).length}`,
      `Respondidos a tiempo: ${i.slaResp}`,
      `Resueltos a tiempo: ${i.slaResol}`,
      `Tiempo medio de resolución: ${i.tiempoResol == null ? 'sin datos' : duracion(i.tiempoResol)}`,
      `Satisfacción: ${i.csat == null ? 'sin encuestas' : `${i.csat.toFixed(1)} de 5 (${i.encuestas} encuestas)`}`,
      '',
      `Podés ver el detalle en ${APP_URL}/portal?ver=org`,
    ].join('\n')
    for (const r of destinatarios) {
      if (await enviarEmail(r.email, `Resumen de ${nombreMes}: ${org.nombre}`, `Hola ${r.nombre || ''},\n\n${texto}`)) enviados++
    }
  }
  return enviados
}

/**
 * Corre la revisión si pasaron más de 10 minutos desde la última.
 * Se llama al abrir la bandeja, así el escalamiento funciona aunque el cron de Vercel sea diario.
 */
export async function revisarSiToca() {
  try {
    const ultima = await leerConfig<{ en: string }>('ultima_revision', { en: '' })
    if (ultima.en && Date.now() - new Date(ultima.en).getTime() < 10 * 60000) return
    await guardarConfig('ultima_revision', { en: new Date().toISOString() })
    await revisar()
  } catch (e) {
    console.error('Revisión periódica falló:', e)
  }
}
