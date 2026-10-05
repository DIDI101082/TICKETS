'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Categoria } from '@/lib/tipos'
import { crear } from './acciones'

interface Sugerencia {
  id: string
  titulo: string
  categoria: string
}

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button className="btn" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar ticket'}
    </button>
  )
}

export default function Formulario({ categorias }: { categorias: Categoria[] }) {
  const [categoriaId, setCategoriaId] = useState('')
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const categoria = categorias.find((c) => c.id === categoriaId)

  useEffect(() => {
    const texto = `${asunto} ${descripcion}`.trim()
    if (texto.length < 8) {
      setSugerencias([])
      return
    }
    const control = new AbortController()
    const espera = setTimeout(async () => {
      try {
        const r = await fetch(`/api/kb/sugerir?q=${encodeURIComponent(texto.slice(0, 300))}`, { signal: control.signal })
        if (r.ok) setSugerencias(await r.json())
      } catch {
        // sin sugerencias: el formulario sigue funcionando igual
      }
    }, 450)
    return () => {
      clearTimeout(espera)
      control.abort()
    }
  }, [asunto, descripcion])

  return (
    <form action={crear} className="tarjeta space-y-4 p-5">
      {categorias.length > 0 && (
        <div>
          <label className="rotulo" htmlFor="categoria_id">Tipo de pedido</label>
          <select id="categoria_id" name="categoria_id" required className="campo" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
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
        <input id="asunto" name="asunto" required maxLength={200} className="campo" placeholder="Ej.: No puedo conectarme a la VPN" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
      </div>

      {categoria?.campos?.map((c, i) => (
        <div key={`${categoria.id}-${i}`}>
          <label className="rotulo" htmlFor={`campo_${i}`}>
            {c.etiqueta}
            {!c.requerido && <span className="font-normal text-ink/40"> (opcional)</span>}
          </label>
          {c.tipo === 'lista' ? (
            <select id={`campo_${i}`} name={`campo_${i}`} required={c.requerido} className="campo" defaultValue="">
              <option value="" disabled={c.requerido}>Elegí una opción…</option>
              {c.opciones.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : c.tipo === 'parrafo' ? (
            <textarea id={`campo_${i}`} name={`campo_${i}`} required={c.requerido} rows={3} className="campo" />
          ) : (
            <input id={`campo_${i}`} name={`campo_${i}`} required={c.requerido} className="campo" />
          )}
        </div>
      ))}

      <div>
        <label className="rotulo" htmlFor="descripcion">Descripción</label>
        <textarea
          id="descripcion"
          name="descripcion"
          required
          rows={6}
          className="campo"
          placeholder="Qué pasó, desde cuándo, qué mensaje de error aparece, a quiénes afecta…"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>

      {sugerencias.length > 0 && (
        <div className="rounded-lg bg-brand-50 p-3">
          <p className="text-sm font-medium text-brand-700">Quizás esto te resuelve el problema ahora:</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {sugerencias.map((s) => (
              <li key={s.id}>
                <a href={`/kb/${s.id}`} target="_blank" rel="noopener" className="text-brand-700 underline">{s.titulo}</a>
                <span className="text-ink/45"> · {s.categoria}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label className="rotulo" htmlFor="archivos">Adjuntos (opcional)</label>
        <input id="archivos" name="archivos" type="file" multiple className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-line/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-medium" />
        <p className="mt-1 text-xs text-ink/45">Hasta 5 archivos, 4 MB en total.</p>
      </div>

      <Enviar />
    </form>
  )
}
