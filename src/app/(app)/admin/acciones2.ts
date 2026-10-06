'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { exigirAdmin, exigirSupervisor } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'
import { guardarConfig, leerMantenimiento } from '@/lib/config'
import { clasificar, iaDisponible } from '@/lib/ia'
import { avisarTeams, enviarEmail } from '@/lib/avisos'
import { ESTADOS, PRIORIDADES } from '@/lib/tipos'

const entero = (v: FormDataEntryValue | null, min: number) => Math.max(min, Math.round(Number(v) || 0))
const texto = (v: FormDataEntryValue | null, max: number) => String(v || '').trim().slice(0, max)
const uuid = (v: FormDataEntryValue | null) => String(v || '') || null
const esFecha = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v))

// ---------- Personas: alta, baja y anonimización ----------

export interface ResultadoAlta {
  filas: { email: string; clave?: string; error?: string }[]
}

/** Una persona por línea:  mail, Nombre Apellido, rol (usuario | agente | admin). Devuelve la clave temporal de cada una. */
export async function crearPersonas(_previo: ResultadoAlta | null, form: FormData): Promise<ResultadoAlta> {
  const { perfil } = await exigirAdmin()
  const svc = admin()
  const lineas = String(form.get('lineas') || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 100)
  const filas: ResultadoAlta['filas'] = []

  for (const linea of lineas) {
    const [crudo, nombre = '', rolCrudo = ''] = linea.split(/[,;\t]/).map((p) => p.trim())
    const email = crudo.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      filas.push({ email: crudo, error: 'Mail inválido' })
      continue
    }
    const rol = /^admin/i.test(rolCrudo) ? 'admin' : /^agente/i.test(rolCrudo) ? 'agente' : 'usuario'
    const clave = randomBytes(9).toString('base64url')
    const { data, error } = await svc.auth.admin.createUser({ email, password: clave, email_confirm: true, user_metadata: { full_name: nombre } })
    if (error || !data.user) {
      filas.push({ email, error: /already|registered|exists/i.test(error?.message ?? '') ? 'Ya tiene cuenta' : error?.message ?? 'No se pudo crear' })
      continue
    }
    if (rol !== 'usuario') await svc.from('perfiles').update({ rol, tipo: 'interno' }).eq('id', data.user.id)
    filas.push({ email, clave })
  }
  const creadas = filas.filter((f) => f.clave).length
  if (creadas) await auditar(perfil, 'Creó cuentas', 'persona', `${creadas} cuentas`, filas.filter((f) => f.clave).map((f) => f.email).join(', '))
  revalidatePath('/admin/personas')
  return { filas }
}

export async function cambiarActivo(id: string, activo: boolean) {
  const { perfil } = await exigirAdmin()
  if (id === perfil.id) return
  const svc = admin()
  const { data: p } = await svc.from('perfiles').select('email').eq('id', id).maybeSingle()
  await svc.from('perfiles').update({ activo }).eq('id', id)
  // Además de marcarla, se bloquea el ingreso en el sistema de autenticación.
  await svc.auth.admin.updateUserById(id, { ban_duration: activo ? 'none' : '876000h' })
  if (!activo) await svc.from('agente_sectores').delete().eq('perfil_id', id)
  await auditar(perfil, activo ? 'Reactivó cuenta' : 'Desactivó cuenta', 'persona', p?.email ?? id)
  revalidatePath('/admin/personas')
}

/** Borra los datos personales de alguien de todos sus tickets. No se puede deshacer. */
export async function anonimizar(id: string, form: FormData) {
  const { perfil } = await exigirAdmin()
  if (id === perfil.id || form.get('confirmar') !== 'on') return
  const svc = admin()
  const { data: p } = await svc.from('perfiles').select('email').eq('id', id).maybeSingle()
  if (!p) return
  const falso = `eliminado-${id.slice(0, 8)}@eliminado.invalid`
  await svc.from('tickets').update({ solicitante_nombre: 'Persona eliminada', solicitante_email: '' }).eq('solicitante_id', id)
  await svc.from('tickets').update({ solicitante_nombre: 'Persona eliminada', solicitante_email: '' }).ilike('solicitante_email', p.email)
  await svc.from('tickets').update({ beneficiario_nombre: 'Persona eliminada' }).eq('beneficiario_id', id)
  await svc.from('mensajes').update({ autor_nombre: 'Persona eliminada' }).eq('autor_id', id)
  await svc.from('ticket_seguidores').delete().eq('perfil_id', id)
  await svc.from('notificaciones').delete().eq('perfil_id', id)
  await svc.from('agente_sectores').delete().eq('perfil_id', id)
  await svc.from('perfiles').update({ nombre: 'Persona eliminada', email: falso, activo: false, rol: 'usuario', organizacion_id: null, jefe_id: null }).eq('id', id)
  await svc.auth.admin.updateUserById(id, { email: falso, ban_duration: '876000h', user_metadata: { full_name: '' } })
  // En la auditoría queda el hecho, no el mail de la persona.
  await auditar(perfil, 'Anonimizó a una persona', 'persona', id.slice(0, 8))
  revalidatePath('/admin/personas')
}

// ---------- Guardias ----------

export async function agregarGuardia(form: FormData) {
  await exigirSupervisor()
  const fila = { sector_id: uuid(form.get('sector_id')), perfil_id: uuid(form.get('perfil_id')), desde: String(form.get('desde')), hasta: String(form.get('hasta')) }
  if (!fila.sector_id || !fila.perfil_id || !esFecha(fila.desde) || !esFecha(fila.hasta) || fila.hasta < fila.desde) return
  await admin().from('guardias').insert(fila)
  revalidatePath('/guardias')
}

export async function quitarGuardia(id: string) {
  await exigirSupervisor()
  await admin().from('guardias').delete().eq('id', id)
  revalidatePath('/guardias')
}

// ---------- Reglas automáticas ----------

export async function guardarRegla(id: string | null, form: FormData) {
  const { perfil } = await exigirAdmin()
  const prioridad = String(form.get('prioridad') || '')
  const canal = String(form.get('canal') || '')
  const limpio = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== false))
  const fila = {
    nombre: texto(form.get('nombre'), 80),
    orden: entero(form.get('orden'), 0),
    activo: id ? form.get('activo') === 'on' : true,
    cond: limpio({
      categoria_id: uuid(form.get('c_categoria')),
      organizacion_id: uuid(form.get('c_organizacion')),
      sector_id: uuid(form.get('c_sector')),
      canal: ['portal', 'email', 'teams', 'telefono', 'monitoreo'].includes(canal) ? canal : '',
      contiene: texto(form.get('c_contiene'), 200),
    }),
    acc: limpio({
      prioridad: PRIORIDADES.some((p) => p.valor === prioridad) ? prioridad : '',
      sector_id: uuid(form.get('a_sector')),
      asignado_id: uuid(form.get('a_asignado')),
      confidencial: form.get('a_confidencial') === 'on',
      avisar_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.get('a_avisar') || '').trim()) ? String(form.get('a_avisar')).trim().toLowerCase() : '',
    }),
  }
  if (!fila.nombre) return
  const db = admin()
  const { error } = id ? await db.from('reglas').update(fila).eq('id', id) : await db.from('reglas').insert(fila)
  if (error) throw new Error(`No se pudo guardar la regla: ${error.message}`)
  await auditar(perfil, id ? 'Modificó regla' : 'Creó regla', 'regla', fila.nombre)
  revalidatePath('/admin/reglas')
}

export async function eliminarRegla(id: string) {
  const { perfil } = await exigirAdmin()
  await admin().from('reglas').delete().eq('id', id)
  await auditar(perfil, 'Eliminó regla', 'regla', id.slice(0, 8))
  revalidatePath('/admin/reglas')
}

// ---------- SLA especiales ----------

export async function agregarSlaEspecial(form: FormData) {
  const { perfil } = await exigirAdmin()
  const prioridad = String(form.get('prioridad') || '')
  const fila = {
    organizacion_id: uuid(form.get('organizacion_id')),
    categoria_id: uuid(form.get('categoria_id')),
    prioridad,
    minutos_respuesta: entero(form.get('minutos_respuesta'), 1),
    minutos_resolucion: entero(form.get('minutos_resolucion'), 1),
  }
  if ((!fila.organizacion_id && !fila.categoria_id) || !PRIORIDADES.some((p) => p.valor === prioridad)) return
  const db = admin()
  await db.from('sla_especiales').insert(fila)
  await db.rpc('tk_recalcular_sla')
  await auditar(perfil, 'Agregó SLA especial', 'config')
  revalidatePath('/admin')
}

export async function quitarSlaEspecial(id: string) {
  await exigirAdmin()
  const db = admin()
  await db.from('sla_especiales').delete().eq('id', id)
  await db.rpc('tk_recalcular_sla')
  revalidatePath('/admin')
}

// ---------- Mantenimiento, mails y reporte ----------

export async function guardarMantenimiento(form: FormData) {
  const { perfil } = await exigirAdmin()
  const actual = await leerMantenimiento()
  await guardarConfig('mantenimiento', {
    ...actual,
    cerrar_resueltos_dias: entero(form.get('cerrar_resueltos_dias'), 0),
    recordar_espera_dias: entero(form.get('recordar_espera_dias'), 0),
    borrar_adjuntos_meses: entero(form.get('borrar_adjuntos_meses'), 0),
    tablero_solo_supervisores: form.get('tablero_solo_supervisores') === 'on',
  })
  await auditar(perfil, 'Modificó mantenimiento', 'config')
  revalidatePath('/', 'layout')
}

export async function guardarMails(form: FormData) {
  const { perfil } = await exigirAdmin()
  await guardarConfig('mails', { firma: texto(form.get('firma'), 300), pie: texto(form.get('pie'), 600) })
  await guardarConfig('reporte', { destinatarios: texto(form.get('destinatarios'), 600) })
  await auditar(perfil, 'Modificó textos de mail y reporte', 'config')
  revalidatePath('/admin/integraciones')
}

/** Prueba una integración y devuelve el resultado en una frase. */
export async function probar(_previo: string | null, form: FormData): Promise<string> {
  const { perfil } = await exigirAdmin()
  const cual = String(form.get('cual'))
  if (cual === 'ia') {
    if (!iaDisponible()) return 'IA: falta cargar ANTHROPIC_API_KEY.'
    const { data: sectores } = await admin().from('sectores').select('id,nombre,descripcion').eq('activo', true)
    const r = await clasificar('No puedo conectarme a la VPN desde casa', 'Me pide usuario y contraseña y dice que son incorrectos.', sectores ?? [])
    return r.sugerido ? `IA: respondió. Para un pedido de prueba sobre VPN sugirió "${r.sugerido}" con ${Math.round((r.confianza ?? 0) * 100)}% de confianza.` : `IA: no respondió (${r.motivo}). Revisá la clave y el modelo.`
  }
  if (cual === 'mail') {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return 'Mail: faltan RESEND_API_KEY o EMAIL_FROM.'
    const ok = await enviarEmail(perfil.email, 'Prueba de la mesa de ayuda', 'Si estás leyendo esto, el envío de mails funciona.')
    return ok ? `Mail: enviado a ${perfil.email}. Revisá la casilla (y el spam).` : 'Mail: el servicio rechazó el envío. Revisá la clave y que el dominio del remitente esté verificado.'
  }
  if (cual === 'teams') {
    if (!process.env.TEAMS_WEBHOOK_URL) return 'Teams: falta cargar TEAMS_WEBHOOK_URL.'
    const ok = await avisarTeams('Prueba de la mesa de ayuda', [`La envió ${perfil.nombre || perfil.email}. Si la ven, los avisos funcionan.`])
    return ok ? 'Teams: mensaje enviado. Revisá el canal.' : 'Teams: el flujo no aceptó el mensaje. Revisá la dirección del webhook.'
  }
  return 'Prueba desconocida.'
}

// ---------- Papelera ----------

export async function restaurar(id: string) {
  const { perfil } = await exigirAdmin()
  const { data } = await admin().from('tickets').update({ eliminado_en: null, eliminado_por: '' }).eq('id', id).select('numero').maybeSingle()
  await auditar(perfil, 'Restauró ticket de la papelera', 'ticket', `#${data?.numero ?? ''}`)
  revalidatePath('/admin/datos')
}

export async function borrarDefinitivo(id: string) {
  const { perfil } = await exigirAdmin()
  const svc = admin()
  const { data: t } = await svc.from('tickets').select('numero').eq('id', id).not('eliminado_en', 'is', null).maybeSingle()
  if (!t) return
  const { data: adj } = await svc.from('adjuntos').select('ruta').eq('ticket_id', id)
  if (adj?.length) await svc.storage.from('adjuntos').remove(adj.map((a) => a.ruta))
  await svc.from('tickets').delete().eq('id', id)
  await auditar(perfil, 'Borró ticket definitivamente', 'ticket', `#${t.numero}`)
  revalidatePath('/admin/datos')
}

// ---------- Importar historial ----------

function leerCsv(crudo: string): string[][] {
  const texto = crudo.replace(/^﻿/, '')
  const primera = texto.split('\n')[0] ?? ''
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo)
      if (fila.some((x) => x.trim())) filas.push(fila)
      fila = []
      campo = ''
    } else campo += c
  }
  fila.push(campo)
  if (fila.some((x) => x.trim())) filas.push(fila)
  return filas
}

function leerFecha(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  // dd/mm/aaaa [hh:mm], que es como exporta Excel en español
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/)
  const d = m ? new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] ?? '12').padStart(2, '0')}:${m[5] ?? '00'}:00-03:00`) : new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export interface ResultadoImportar {
  importados: number
  errores: string[]
}

export async function importar(_previo: ResultadoImportar | null, form: FormData): Promise<ResultadoImportar> {
  const { perfil } = await exigirAdmin()
  const archivo = form.get('archivo')
  const crudo = archivo instanceof File && archivo.size > 0 ? await archivo.text() : String(form.get('texto') || '')
  const filas = leerCsv(crudo)
  if (filas.length < 2) return { importados: 0, errores: ['No se encontraron filas. La primera línea tiene que ser el encabezado.'] }

  const cab = filas[0].map((c) => c.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const col = (...nombres: string[]) => cab.findIndex((c) => nombres.includes(c))
  const i = {
    asunto: col('asunto', 'titulo', 'subject'),
    descripcion: col('descripcion', 'detalle', 'description'),
    estado: col('estado', 'status'),
    prioridad: col('prioridad', 'priority'),
    sector: col('sector', 'area'),
    email: col('email', 'mail', 'solicitante_email', 'email del solicitante'),
    nombre: col('solicitante', 'nombre', 'solicitante_nombre'),
    creado: col('creado', 'fecha', 'fecha de creacion', 'created'),
    resuelto: col('resuelto', 'fecha de resolucion', 'cerrado', 'resolved'),
  }
  if (i.asunto < 0) return { importados: 0, errores: ['Falta la columna "asunto".'] }

  const svc = admin()
  const { data: sectores } = await svc.from('sectores').select('id,nombre')
  const sectorPorNombre = new Map((sectores ?? []).map((s) => [String(s.nombre).toLowerCase(), s.id as string]))
  const errores: string[] = []
  const nuevas: Record<string, unknown>[] = []

  filas.slice(1, 2001).forEach((f, n) => {
    const dato = (k: keyof typeof i) => (i[k] >= 0 ? (f[i[k]] ?? '').trim() : '')
    const asunto = dato('asunto')
    if (!asunto) {
      errores.push(`Fila ${n + 2}: sin asunto, se salteó.`)
      return
    }
    const estadoCrudo = dato('estado').toLowerCase()
    const estado = ESTADOS.find((e) => e.valor === estadoCrudo.replace(/ /g, '_') || e.etiqueta.toLowerCase() === estadoCrudo)?.valor ?? (/(cerr|clos|resuel|solv)/.test(estadoCrudo) ? 'cerrado' : 'abierto')
    const prioridadCruda = dato('prioridad').toLowerCase()
    const creado = leerFecha(dato('creado'))
    if (dato('creado') && !creado) errores.push(`Fila ${n + 2}: no se entendió la fecha "${dato('creado')}", se usó la de hoy.`)
    const terminado = estado === 'resuelto' || estado === 'cerrado'
    nuevas.push({
      asunto: asunto.slice(0, 200),
      descripcion: dato('descripcion').slice(0, 20000),
      estado,
      prioridad: PRIORIDADES.find((p) => p.valor === prioridadCruda || p.etiqueta.toLowerCase() === prioridadCruda)?.valor ?? 'media',
      canal: 'importado',
      sector_id: sectorPorNombre.get(dato('sector').toLowerCase()) ?? null,
      solicitante_email: dato('email').toLowerCase(),
      solicitante_nombre: dato('nombre'),
      ...(creado ? { creado_en: creado, actualizado_en: leerFecha(dato('resuelto')) ?? creado } : {}),
      resuelto_en: terminado ? leerFecha(dato('resuelto')) ?? creado ?? new Date().toISOString() : null,
      // Lo importado no dispara avisos de SLA ni escalamiento.
      alerta_respuesta: true,
      alerta_resolucion: true,
      escalado_en: new Date().toISOString(),
    })
  })

  let importados = 0
  for (let k = 0; k < nuevas.length; k += 200) {
    const { error, count } = await svc.from('tickets').insert(nuevas.slice(k, k + 200), { count: 'exact' })
    if (error) errores.push(`Filas ${k + 2} a ${k + 201}: ${error.message}`)
    else importados += count ?? 0
  }
  if (filas.length > 2001) errores.push('Se importaron las primeras 2000 filas. Subí el resto en otro archivo.')
  await auditar(perfil, 'Importó tickets', 'ticket', `${importados} tickets`)
  revalidatePath('/admin/datos')
  return { importados, errores: errores.slice(0, 30) }
}
