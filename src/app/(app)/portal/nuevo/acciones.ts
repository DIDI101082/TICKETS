'use server'

import { redirect } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { asistir } from '@/lib/ia'
import { claves, coincidencias } from '@/lib/texto'
import { archivosDe, crearTicket, registrarEvento, subirAdjuntos } from '@/lib/tickets'
import { IMPACTOS, URGENCIAS, type Categoria, type Dato } from '@/lib/tipos'
import { campoFechaLegible } from '@/lib/formato'
import { contextoDe, cyberConfigurado } from '@/lib/cyber'
import { leerHorario } from '@/lib/config'
import { diagnosticar, resumenDiagnostico, type Diagnostico, type Hallazgo, type TipoDiagnostico } from '@/lib/diagnostico'

const mails = (texto: string) => [...new Set(texto.toLowerCase().match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g) ?? [])].slice(0, 10)

export async function crear(form: FormData) {
  const { db, perfil, staff } = await sesion()
  const asunto = String(form.get('asunto') || '').trim()
  const descripcion = String(form.get('descripcion') || '').trim()
  if (!asunto || !descripcion) redirect('/portal/nuevo')

  // Las respuestas del formulario se arman contra los campos definidos en la categoría, no contra lo que mande el navegador.
  const categoriaId = String(form.get('categoria_id') || '') || null
  let datos: Dato[] = []
  if (categoriaId) {
    const { data } = await db.from('categorias').select('*').eq('id', categoriaId).eq('activo', true).maybeSingle()
    const cat = data as Categoria | null
    if (!cat) redirect('/portal/nuevo')
    datos = (cat.campos ?? [])
      .map((c, i) => {
        const valor = String(form.get(`campo_${i}`) || '').trim().slice(0, 2000)
        return { etiqueta: c.etiqueta, valor: c.tipo === 'fecha' ? campoFechaLegible(valor) : valor }
      })
      .filter((d) => d.valor)
  }

  const impacto = String(form.get('impacto') || '')
  const urgencia = String(form.get('urgencia') || '')

  // "Para quién es" y "en copia": solo se vinculan personas que ya tienen cuenta.
  const paraQuien = String(form.get('para') || '').trim().slice(0, 120)
  const enCopia = mails(String(form.get('copia') || ''))
  const buscados = [...new Set([...mails(paraQuien), ...enCopia])]
  const { data: encontrados } = buscados.length ? await admin().from('perfiles').select('id,nombre,email').in('email', buscados) : { data: [] }
  const porMail = new Map((encontrados ?? []).map((p) => [String(p.email).toLowerCase(), p]))
  const beneficiario = porMail.get(mails(paraQuien)[0] ?? '')

  // Solo el equipo puede cargar un ticket a nombre de otra persona (lo que entra por teléfono o en persona).
  const otroMail = staff ? String(form.get('solicitante_email') || '').trim().toLowerCase() : ''
  let solicitante = { id: perfil.id as string | null, email: perfil.email, nombre: perfil.nombre }
  if (otroMail && otroMail !== perfil.email.toLowerCase()) {
    const { data: otro } = await admin().from('perfiles').select('id,nombre,email').ilike('email', otroMail).maybeSingle()
    solicitante = otro ? { id: otro.id, email: otro.email, nombre: otro.nombre } : { id: null, email: otroMail, nombre: String(form.get('solicitante_nombre') || '').trim().slice(0, 80) || otroMail.split('@')[0] }
  }
  const enNombre = solicitante.id !== perfil.id

  const t = await crearTicket({
    asunto,
    descripcion,
    canal: enNombre ? 'telefono' : 'portal',
    solicitanteId: solicitante.id,
    email: solicitante.email,
    nombre: solicitante.nombre,
    categoriaId,
    datos,
    impacto: IMPACTOS.some((x) => x.valor === impacto) ? impacto : '',
    urgencia: URGENCIAS.some((x) => x.valor === urgencia) ? urgencia : '',
    beneficiarioId: beneficiario && beneficiario.id !== solicitante.id ? beneficiario.id : null,
    beneficiarioNombre: beneficiario ? beneficiario.nombre || beneficiario.email : paraQuien,
    seguidores: enCopia.map((m) => porMail.get(m)?.id).filter((x): x is string => !!x && x !== perfil.id),
  })
  if (enNombre) await registrarEvento(t.id, perfil.nombre, `Cargado por ${perfil.nombre || perfil.email} en nombre de ${solicitante.nombre || solicitante.email}`)
  // Si antes vio el diagnóstico, se deja como nota interna para quien lo atienda.
  const autoId = String(form.get('autoservicio_id') || '')
  if (autoId && !enNombre) {
    const { data: auto } = await admin().from('autoservicio').select('id,hallazgos').eq('id', autoId).eq('perfil_id', perfil.id).maybeSingle()
    if (auto) {
      await admin().from('autoservicio').update({ resultado: 'ticket', ticket_id: t.id, actualizado_en: new Date().toISOString() }).eq('id', auto.id)
      await admin().from('mensajes').insert({ ticket_id: t.id, autor_id: null, autor_nombre: 'Diagnóstico automático', de_staff: true, interno: true, cuerpo: resumenDiagnostico(auto.hallazgos as Hallazgo[]) })
    }
  }
  await subirAdjuntos(t.id, null, archivosDe(form))
  redirect(`/tickets/${t.id}`)
}

/** Busca una solución en la base de conocimiento antes de cargar el ticket. */
export async function asistente(asunto: string, descripcion: string): Promise<{ respuesta?: string; articulos: { id: string; titulo: string }[] }> {
  const { db } = await sesion()
  const consulta = `${asunto}\n${descripcion}`.slice(0, 3000)
  const mias = claves(consulta)
  if (mias.length < 2) return { articulos: [] }

  // La seguridad por fila limita los artículos a los que esta persona puede ver.
  const { data } = await db.from('articulos').select('id,titulo,contenido').eq('publicado', true).limit(300)
  const utiles = (data ?? [])
    .map((a) => ({ id: a.id as string, titulo: a.titulo as string, contenido: a.contenido as string, puntos: coincidencias(mias, claves(a.titulo)) * 3 + coincidencias(mias, claves(a.contenido)) }))
    .filter((a) => a.puntos >= 3)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 3)
  if (!utiles.length) return { articulos: [] }

  const respuesta = await asistir(consulta, utiles)
  return { respuesta: respuesta ?? undefined, articulos: utiles.map(({ id, titulo }) => ({ id, titulo })) }
}

/** ¿Estamos fuera del horario laboral? (para el diagnóstico de VPN) */
async function fueraDeHorario() {
  const h = await leerHorario()
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: h.zona || 'America/Argentina/Buenos_Aires', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  )
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday)
  const hora = `${partes.hour}:${partes.minute}`
  return !h.dias.includes(dia) || hora < h.desde || hora >= h.hasta
}

/** Revisa el equipo y la cuenta de la persona con los datos de Accusys Cyber, antes de que envíe el pedido. */
export async function revisarAntes(categoriaId: string, equipo: string): Promise<(Diagnostico & { id: string; actualizado: string | null }) | null> {
  const { db, perfil } = await sesion()
  if (!cyberConfigurado()) return null
  const { data: cat } = await db.from('categorias').select('id,diagnostico').eq('id', categoriaId).eq('activo', true).maybeSingle()
  const tipo = cat?.diagnostico as TipoDiagnostico | null
  if (!tipo) return null
  const [{ datos }, { data: accesos }, fuera] = await Promise.all([
    contextoDe(perfil.email, 'diagnostico'),
    db.from('accesos').select('sistema,estado,hasta').eq('persona_id', perfil.id),
    fueraDeHorario(),
  ])
  if (!datos?.encontrado) return null
  const d = diagnosticar(tipo, datos, { accesos: accesos ?? [], fueraDeHorario: fuera, equipo: equipo.slice(0, 80) })
  const { data: fila } = await admin()
    .from('autoservicio')
    .insert({ perfil_id: perfil.id, categoria_id: cat!.id, tipo, hallazgos: d.hallazgos })
    .select('id')
    .single()
  const reportes = (datos.equipos ?? []).map((e) => e.ultimo_reporte).filter((x): x is string => !!x).sort()
  return { ...d, id: fila?.id ?? '', actualizado: reportes.at(-1) ?? null }
}

/** "Listo, se solucionó": no se carga el pedido y queda contado como resuelto por autoservicio. */
export async function seSoluciono(id: string) {
  const { perfil } = await sesion()
  if (id) await admin().from('autoservicio').update({ resultado: 'resuelto', actualizado_en: new Date().toISOString() }).eq('id', id).eq('perfil_id', perfil.id).eq('resultado', 'mostrado')
  redirect('/portal?ok=solucionado')
}
