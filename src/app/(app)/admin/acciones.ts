'use server'

import { revalidatePath } from 'next/cache'
import { exigirAdmin, exigirStaff } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { auditar } from '@/lib/auditoria'
import { guardarConfig, leerHorario, leerOpciones } from '@/lib/config'
import { PRIORIDADES, type Campo } from '@/lib/tipos'

const entero = (v: FormDataEntryValue | null, min: number) => Math.max(min, Math.round(Number(v) || 0))
const texto = (v: FormDataEntryValue | null, max: number) => String(v || '').trim().slice(0, max)
const uuid = (v: FormDataEntryValue | null) => String(v || '') || null

// ---------- Sectores, SLA, horario y opciones ----------

export async function guardarSector(id: string | null, form: FormData) {
  const { perfil } = await exigirAdmin()
  const fila = {
    nombre: texto(form.get('nombre'), 60),
    descripcion: texto(form.get('descripcion'), 1000),
    orden: entero(form.get('orden'), 0),
    responsable_id: uuid(form.get('responsable_id')),
    asignacion: ['turno', 'carga'].includes(String(form.get('asignacion'))) ? String(form.get('asignacion')) : 'manual',
    activo: id ? form.get('activo') === 'on' : true,
  }
  if (!fila.nombre) return
  const db = admin()
  const { error } = id ? await db.from('sectores').update(fila).eq('id', id) : await db.from('sectores').insert(fila)
  if (error) throw new Error(`No se pudo guardar el sector: ${error.message}`)
  await auditar(perfil, id ? 'Modificó sector' : 'Creó sector', 'sector', fila.nombre)
  revalidatePath('/admin')
}

export async function guardarSla(form: FormData) {
  const { perfil } = await exigirAdmin()
  const db = admin()
  for (const p of PRIORIDADES) {
    await db
      .from('sla_politicas')
      .update({ minutos_respuesta: entero(form.get(`resp_${p.valor}`), 1), minutos_resolucion: entero(form.get(`resol_${p.valor}`), 1) })
      .eq('prioridad', p.valor)
  }
  await db.rpc('tk_recalcular_sla')
  await auditar(perfil, 'Modificó tiempos de SLA', 'config')
  revalidatePath('/admin')
}

export async function guardarHorario(form: FormData) {
  const { perfil } = await exigirAdmin()
  const actual = await leerHorario()
  const hora = (v: FormDataEntryValue | null, def: string) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : def)
  const nuevo = {
    ...actual,
    activo: form.get('activo') === 'on',
    dias: form.getAll('dias').map(Number).filter((d) => d >= 1 && d <= 7),
    desde: hora(form.get('desde'), actual.desde),
    hasta: hora(form.get('hasta'), actual.hasta),
  }
  // Un horario sin días o con las horas invertidas dejaría los vencimientos sin sentido.
  if (nuevo.activo && (!nuevo.dias.length || nuevo.hasta <= nuevo.desde)) nuevo.activo = false
  await guardarConfig('horario', nuevo)
  await admin().rpc('tk_recalcular_sla')
  await auditar(perfil, 'Modificó horario de atención', 'config', '', nuevo.activo ? `${nuevo.desde} a ${nuevo.hasta}` : 'Desactivado (24×7)')
  revalidatePath('/admin')
}

export async function agregarFeriado(form: FormData) {
  await exigirAdmin()
  const fecha = String(form.get('fecha') || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return
  await admin().from('feriados').upsert({ fecha, nombre: texto(form.get('nombre'), 80) })
  await admin().rpc('tk_recalcular_sla')
  revalidatePath('/admin')
}

export async function quitarFeriado(fecha: string) {
  await exigirAdmin()
  await admin().from('feriados').delete().eq('fecha', fecha)
  await admin().rpc('tk_recalcular_sla')
  revalidatePath('/admin')
}

export async function guardarOpciones(form: FormData) {
  const { perfil } = await exigirAdmin()
  const actual = await leerOpciones()
  const nuevo = {
    ...actual,
    restringir_sector: form.get('restringir_sector') === 'on',
    escalar_sin_tomar_min: entero(form.get('escalar_sin_tomar_min'), 0),
    incidente_cantidad: entero(form.get('incidente_cantidad'), 0),
    incidente_minutos: entero(form.get('incidente_minutos'), 5),
  }
  await guardarConfig('opciones', nuevo)
  await auditar(perfil, 'Modificó opciones', 'config', '', `Restricción por sector: ${nuevo.restringir_sector ? 'sí' : 'no'}`)
  revalidatePath('/admin')
}

// ---------- Categorías ----------

/** Una línea por campo:  Etiqueta | tipo | opciones separadas por coma | obligatorio */
function leerCampos(crudo: string): Campo[] {
  return crudo
    .split('\n')
    .map((l) => l.split('|').map((p) => p.trim()))
    .filter((p) => p[0])
    .slice(0, 12)
    .map((p) => {
      const tipo = /^lista/i.test(p[1] ?? '') ? 'lista' : /^p[aá]rrafo/i.test(p[1] ?? '') ? 'parrafo' : 'texto'
      return {
        etiqueta: p[0].slice(0, 80),
        tipo,
        opciones: tipo === 'lista' ? (p[2] ?? '').split(',').map((o) => o.trim()).filter(Boolean).slice(0, 20) : [],
        requerido: /oblig|^s[ií]$/i.test(p[3] ?? ''),
      } as Campo
    })
}

export async function guardarCategoria(id: string | null, form: FormData) {
  const { perfil } = await exigirAdmin()
  const prioridad = String(form.get('prioridad') || '')
  const fila = {
    nombre: texto(form.get('nombre'), 60),
    descripcion: texto(form.get('descripcion'), 300),
    sector_id: uuid(form.get('sector_id')),
    prioridad: PRIORIDADES.some((p) => p.valor === prioridad) ? prioridad : null,
    campos: leerCampos(String(form.get('campos') || '')),
    requiere_aprobacion: form.get('requiere_aprobacion') === 'on',
    confidencial: form.get('confidencial') === 'on',
    orden: entero(form.get('orden'), 0),
    activo: id ? form.get('activo') === 'on' : true,
    aprobador_jefe: form.get('aprobador_jefe') === 'on',
    aprobadores: [] as string[],
  }
  if (!fila.nombre) return
  const db = admin()
  // Aprobadores por mail, en el orden en que tienen que aprobar. Solo se guardan los que tienen cuenta.
  const mails = String(form.get('aprobadores') || '').toLowerCase().split(/[,;\s]+/).filter((m) => m.includes('@')).slice(0, 5)
  if (mails.length) {
    const { data: gente } = await db.from('perfiles').select('id,email').in('email', mails)
    fila.aprobadores = mails.map((m) => (gente ?? []).find((g) => String(g.email).toLowerCase() === m)?.id).filter((x): x is string => !!x)
  }
  const { error } = id ? await db.from('categorias').update(fila).eq('id', id) : await db.from('categorias').insert(fila)
  if (error) throw new Error(`No se pudo guardar la categoría: ${error.message}`)
  await auditar(perfil, id ? 'Modificó categoría' : 'Creó categoría', 'categoria', fila.nombre)
  revalidatePath('/admin/categorias')
}

// ---------- Organizaciones ----------

export async function guardarOrganizacion(id: string | null, form: FormData) {
  const { perfil } = await exigirAdmin()
  const fila = {
    nombre: texto(form.get('nombre'), 80),
    dominios: texto(form.get('dominios'), 300).toLowerCase().replace(/@/g, ''),
    activo: id ? form.get('activo') === 'on' : true,
  }
  if (!fila.nombre) return
  const db = admin()
  const { error } = id ? await db.from('organizaciones').update(fila).eq('id', id) : await db.from('organizaciones').insert(fila)
  if (error) throw new Error(`No se pudo guardar la organización: ${error.message}`)
  await auditar(perfil, id ? 'Modificó organización' : 'Creó organización', 'organizacion', fila.nombre)
  revalidatePath('/admin/organizaciones')
}

// ---------- Personas ----------

export async function guardarUsuario(id: string, form: FormData) {
  const { perfil } = await exigirAdmin()
  const rol = String(form.get('rol') || '')
  const tipo = String(form.get('tipo') || '')
  const db = admin()

  const cambios: Record<string, string | boolean | null> = {
    organizacion_id: uuid(form.get('organizacion_id')),
    ve_organizacion: form.get('ve_organizacion') === 'on',
    supervisor: form.get('supervisor') === 'on',
    ausente_hasta: /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('ausente_hasta'))) ? String(form.get('ausente_hasta')) : null,
  }
  // El jefe se carga por mail; se usa como primer aprobador en las categorías que lo piden.
  const jefeMail = String(form.get('jefe') || '').trim().toLowerCase()
  if (!jefeMail) cambios.jefe_id = null
  else {
    const { data: jefe } = await db.from('perfiles').select('id').ilike('email', jefeMail).maybeSingle()
    if (jefe && jefe.id !== id) cambios.jefe_id = jefe.id
  }
  if (['interno', 'externo'].includes(tipo)) cambios.tipo = tipo
  // Un admin no puede quitarse a sí mismo el rol, para no dejar el sistema sin administradores.
  if (['admin', 'agente', 'usuario'].includes(rol) && id !== perfil.id) cambios.rol = rol

  const { data: antes } = await db.from('perfiles').select('email,rol').eq('id', id).maybeSingle()
  const { error } = await db.from('perfiles').update(cambios).eq('id', id)
  if (error) throw new Error(`No se pudo guardar la persona: ${error.message}`)

  const sectores = form.getAll('sectores').map(String)
  await db.from('agente_sectores').delete().eq('perfil_id', id)
  if (sectores.length && (cambios.rol ?? antes?.rol) !== 'usuario') {
    await db.from('agente_sectores').insert(sectores.map((s) => ({ perfil_id: id, sector_id: s })))
  }
  await auditar(perfil, 'Modificó permisos', 'persona', antes?.email ?? id, cambios.rol && cambios.rol !== antes?.rol ? `Rol: ${antes?.rol} → ${cambios.rol}` : '')
  revalidatePath('/admin/personas')
}

// ---------- Tickets programados ----------

export async function guardarProgramado(id: string | null, form: FormData) {
  const { perfil } = await exigirAdmin()
  const prioridad = String(form.get('prioridad') || 'media')
  const frecuencia = String(form.get('frecuencia') || 'semanal')
  const proxima = String(form.get('proxima') || '')
  const fila = {
    asunto: texto(form.get('asunto'), 200),
    descripcion: texto(form.get('descripcion'), 4000),
    sector_id: uuid(form.get('sector_id')),
    prioridad: PRIORIDADES.some((p) => p.valor === prioridad) ? prioridad : 'media',
    frecuencia: ['diaria', 'semanal', 'mensual'].includes(frecuencia) ? frecuencia : 'semanal',
    proxima,
    activo: id ? form.get('activo') === 'on' : true,
  }
  if (!fila.asunto || !/^\d{4}-\d{2}-\d{2}$/.test(proxima)) return
  const db = admin()
  const { error } = id ? await db.from('programados').update(fila).eq('id', id) : await db.from('programados').insert(fila)
  if (error) throw new Error(`No se pudo guardar la tarea programada: ${error.message}`)
  await auditar(perfil, id ? 'Modificó tarea programada' : 'Creó tarea programada', 'programado', fila.asunto)
  revalidatePath('/admin/programados')
}

export async function eliminarProgramado(id: string) {
  await exigirAdmin()
  await admin().from('programados').delete().eq('id', id)
  revalidatePath('/admin/programados')
}

// ---------- Respuestas predefinidas (las maneja cualquier agente) ----------

export async function guardarPlantilla(id: string | null, form: FormData) {
  await exigirStaff()
  const tras = String(form.get('estado_tras') || '')
  const fila = {
    titulo: texto(form.get('titulo'), 80),
    cuerpo: String(form.get('cuerpo') || '').trim().slice(0, 5000),
    estado_tras: ['en_espera', 'resuelto'].includes(tras) ? tras : '',
    nota_interna: form.get('nota_interna') === 'on',
  }
  if (!fila.titulo || !fila.cuerpo) return
  const db = admin()
  const { error } = id ? await db.from('plantillas').update(fila).eq('id', id) : await db.from('plantillas').insert(fila)
  if (error) throw new Error(`No se pudo guardar la respuesta: ${error.message}`)
  revalidatePath('/plantillas')
}

export async function eliminarPlantilla(id: string) {
  await exigirStaff()
  await admin().from('plantillas').delete().eq('id', id)
  revalidatePath('/plantillas')
}
