'use server'

import { redirect } from 'next/navigation'
import { sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { asistir } from '@/lib/ia'
import { claves, coincidencias } from '@/lib/texto'
import { archivosDe, crearTicket, subirAdjuntos } from '@/lib/tickets'
import { IMPACTOS, URGENCIAS, type Categoria, type Dato } from '@/lib/tipos'

const mails = (texto: string) => [...new Set(texto.toLowerCase().match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g) ?? [])].slice(0, 10)

export async function crear(form: FormData) {
  const { db, perfil } = await sesion()
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
      .map((c, i) => ({ etiqueta: c.etiqueta, valor: String(form.get(`campo_${i}`) || '').trim().slice(0, 2000) }))
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

  const t = await crearTicket({
    asunto,
    descripcion,
    canal: 'portal',
    solicitanteId: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    categoriaId,
    datos,
    impacto: IMPACTOS.some((x) => x.valor === impacto) ? impacto : '',
    urgencia: URGENCIAS.some((x) => x.valor === urgencia) ? urgencia : '',
    beneficiarioId: beneficiario && beneficiario.id !== perfil.id ? beneficiario.id : null,
    beneficiarioNombre: beneficiario ? beneficiario.nombre || beneficiario.email : paraQuien,
    seguidores: enCopia.map((m) => porMail.get(m)?.id).filter((x): x is string => !!x && x !== perfil.id),
  })
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
