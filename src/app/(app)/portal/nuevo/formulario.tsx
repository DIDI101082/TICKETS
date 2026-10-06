'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { IMPACTOS, URGENCIAS, type Categoria } from '@/lib/tipos'
import { pegarImagenes } from '@/components/pegar'
import { asistente, crear } from './acciones'

export interface Inicial {
  categoriaId: string
  asunto: string
  descripcion: string
  // respuestas del formulario, por etiqueta del campo
  datos: Record<string, string>
}

interface Borrador extends Inicial {
  impacto: string
  urgencia: string
  para: string
  copia: string
}

const CLAVE = 'ticket-borrador'
const VACIO: Borrador = { categoriaId: '', asunto: '', descripcion: '', datos: {}, impacto: '', urgencia: '', para: '', copia: '' }

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button className="btn" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar ticket'}
    </button>
  )
}

export default function Formulario({ categorias, inicial }: { categorias: Categoria[]; inicial: Inicial | null }) {
  const [b, setB] = useState<Borrador>({ ...VACIO, ...(inicial ?? {}) })
  const [recuperado, setRecuperado] = useState(false)
  const [version, setVersion] = useState(0)
  const [ayuda, setAyuda] = useState<{ respuesta?: string; articulos: { id: string; titulo: string }[] } | null>(null)
  const [buscando, iniciar] = useTransition()
  const [pegados, setPegados] = useState(0)
  const archivos = useRef<HTMLInputElement>(null)
  const categoria = categorias.find((c) => c.id === b.categoriaId)

  // Borrador: se guarda solo en este navegador. Si se llegó con un pedido precargado, no se pisa.
  useEffect(() => {
    if (inicial) return
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null') as Borrador | null
      if (guardado && (guardado.asunto || guardado.descripcion)) {
        setB({ ...VACIO, ...guardado, categoriaId: categorias.some((c) => c.id === guardado.categoriaId) ? guardado.categoriaId : '' })
        setRecuperado(true)
        setVersion((v) => v + 1)
      }
    } catch {
      // sin acceso al almacenamiento: el formulario funciona igual, sin borrador
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cambiar(parcial: Partial<Borrador>) {
    setB((actual) => {
      const nuevo = { ...actual, ...parcial }
      try {
        localStorage.setItem(CLAVE, JSON.stringify(nuevo))
      } catch {}
      return nuevo
    })
  }

  function descartar() {
    try {
      localStorage.removeItem(CLAVE)
    } catch {}
    setB(VACIO)
    setRecuperado(false)
    setAyuda(null)
    setVersion((v) => v + 1)
  }

  function buscarSolucion() {
    iniciar(async () => {
      setAyuda(await asistente(b.asunto, b.descripcion))
    })
  }

  const puedeBuscar = `${b.asunto} ${b.descripcion}`.trim().length >= 15

  return (
    <form
      key={version}
      action={crear}
      onSubmit={() => {
        try {
          localStorage.removeItem(CLAVE)
        } catch {}
      }}
      className="tarjeta space-y-4 p-5"
    >
      {recuperado && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Recuperamos el borrador que habías empezado.
          <button type="button" onClick={descartar} className="underline">Descartarlo y empezar de cero</button>
        </p>
      )}

      {categorias.length > 0 && (
        <div>
          <label className="rotulo" htmlFor="categoria_id">Tipo de pedido</label>
          <select id="categoria_id" name="categoria_id" required className="campo" value={b.categoriaId} onChange={(e) => cambiar({ categoriaId: e.target.value })}>
            <option value="" disabled>Elegí una opción…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          {categoria?.descripcion && <p className="mt-1 text-xs text-ink/50">{categoria.descripcion}</p>}
          {categoria?.requiere_aprobacion && <p className="mt-1 text-xs text-amber-700">Este tipo de pedido necesita la aprobación de un responsable antes de ejecutarse.</p>}
          {categoria?.confidencial && <p className="mt-1 text-xs text-ink/50">Es confidencial: solo lo ven las personas que lo atienden.</p>}
        </div>
      )}

      <div>
        <label className="rotulo" htmlFor="asunto">Asunto</label>
        <input id="asunto" name="asunto" required maxLength={200} className="campo" placeholder="Ej.: No puedo conectarme a la VPN" value={b.asunto} onChange={(e) => cambiar({ asunto: e.target.value })} />
      </div>

      {categoria?.campos?.map((c, i) => {
        const valor = b.datos[c.etiqueta] ?? ''
        const alCambiar = (v: string) => cambiar({ datos: { ...b.datos, [c.etiqueta]: v } })
        return (
          <div key={`${categoria.id}-${i}`}>
            <label className="rotulo" htmlFor={`campo_${i}`}>
              {c.etiqueta}
              {!c.requerido && <span className="font-normal text-ink/40"> (opcional)</span>}
            </label>
            {c.tipo === 'lista' ? (
              <select id={`campo_${i}`} name={`campo_${i}`} required={c.requerido} className="campo" value={c.opciones.includes(valor) ? valor : ''} onChange={(e) => alCambiar(e.target.value)}>
                <option value="" disabled={c.requerido}>Elegí una opción…</option>
                {c.opciones.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : c.tipo === 'parrafo' ? (
              <textarea id={`campo_${i}`} name={`campo_${i}`} required={c.requerido} rows={3} className="campo" value={valor} onChange={(e) => alCambiar(e.target.value)} />
            ) : (
              <input id={`campo_${i}`} name={`campo_${i}`} required={c.requerido} className="campo" value={valor} onChange={(e) => alCambiar(e.target.value)} />
            )}
          </div>
        )
      })}

      <div>
        <label className="rotulo" htmlFor="descripcion">Descripción</label>
        <textarea
          id="descripcion"
          name="descripcion"
          required
          rows={6}
          className="campo"
          placeholder="Qué pasó, desde cuándo, qué mensaje de error aparece… Podés pegar capturas de pantalla con Ctrl+V."
          value={b.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          onPaste={(e) => {
            const n = pegarImagenes(e, archivos.current)
            if (n) setPegados(n)
          }}
        />
      </div>

      <div className="rounded-lg bg-canvas p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink/70">Antes de enviarlo, podemos buscar si ya hay una solución.</p>
          <button type="button" onClick={buscarSolucion} disabled={!puedeBuscar || buscando} className="btn-sec px-3 py-1.5">
            {buscando ? 'Buscando…' : 'Buscar una solución'}
          </button>
        </div>
        {ayuda && (
          <div className="mt-3 space-y-2 border-t border-line/10 pt-3 text-sm" role="status">
            {ayuda.respuesta && <p className="whitespace-pre-wrap leading-relaxed">{ayuda.respuesta}</p>}
            {ayuda.articulos.length > 0 ? (
              <>
                <p className="text-xs text-ink/50">{ayuda.respuesta ? 'Respuesta armada por IA con estos artículos:' : 'Estos artículos pueden servirte:'}</p>
                <ul className="space-y-1">
                  {ayuda.articulos.map((a) => (
                    <li key={a.id}>
                      <a href={`/kb/${a.id}`} target="_blank" rel="noopener" className="text-brand-600 underline">{a.titulo}</a>
                    </li>
                  ))}
                </ul>
                <p className="pt-1">
                  <Link href="/portal" onClick={descartar} className="font-medium text-brand-600 underline">Me sirvió, no hace falta el ticket</Link>
                  <span className="text-ink/50"> · si no, seguí completando y envialo.</span>
                </p>
              </>
            ) : (
              <p className="text-ink/60">No encontramos nada sobre esto en la ayuda. Envianos el ticket y lo vemos.</p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="impacto">¿A quién afecta?</label>
          <select id="impacto" name="impacto" className="campo" value={b.impacto} onChange={(e) => cambiar({ impacto: e.target.value })}>
            <option value="">Sin indicar</option>
            {IMPACTOS.map((x) => (
              <option key={x.valor} value={x.valor}>{x.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="urgencia">¿Qué tan urgente es?</label>
          <select id="urgencia" name="urgencia" className="campo" value={b.urgencia} onChange={(e) => cambiar({ urgencia: e.target.value })}>
            <option value="">Sin indicar</option>
            {URGENCIAS.map((x) => (
              <option key={x.valor} value={x.valor}>{x.etiqueta}</option>
            ))}
          </select>
          {b.urgencia && <p className="mt-1 text-xs text-ink/50">{URGENCIAS.find((x) => x.valor === b.urgencia)?.ayuda}</p>}
        </div>
      </div>

      <details className="rounded-lg border border-line/10 px-3 py-2" open={!!(b.para || b.copia)}>
        <summary className="cursor-pointer text-sm font-medium text-ink/70">Es para otra persona o quiero poner a alguien en copia</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="para">¿Para quién es el pedido?</label>
            <input id="para" name="para" className="campo" placeholder="Mail o nombre de la persona" value={b.para} onChange={(e) => cambiar({ para: e.target.value })} />
            <p className="mt-1 text-xs text-ink/45">Si tiene cuenta, también va a ver el ticket.</p>
          </div>
          <div>
            <label className="rotulo" htmlFor="copia">Personas en copia</label>
            <input id="copia" name="copia" className="campo" placeholder="Mails separados por coma" value={b.copia} onChange={(e) => cambiar({ copia: e.target.value })} />
            <p className="mt-1 text-xs text-ink/45">Pueden seguir el pedido y comentar. Solo se suman quienes ya tienen cuenta.</p>
          </div>
        </div>
      </details>

      <div>
        <label className="rotulo" htmlFor="archivos">Adjuntos (opcional)</label>
        <input ref={archivos} id="archivos" name="archivos" type="file" multiple className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-line/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-medium" />
        <p className="mt-1 text-xs text-ink/45">
          Hasta 5 archivos, 4 MB en total.{pegados > 0 ? ` Captura agregada (${pegados} en total).` : ''} Los adjuntos no se guardan en el borrador.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Enviar />
        <span className="text-xs text-ink/45">Lo que escribís se guarda como borrador en este navegador.</span>
      </div>
    </form>
  )
}
