'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
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

export default function Formulario() {
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])

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
      <div>
        <label className="rotulo" htmlFor="asunto">Asunto</label>
        <input
          id="asunto"
          name="asunto"
          required
          maxLength={200}
          className="campo"
          placeholder="Ej.: No puedo conectarme a la VPN"
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
        />
      </div>
      <div>
        <label className="rotulo" htmlFor="descripcion">Descripción</label>
        <textarea
          id="descripcion"
          name="descripcion"
          required
          rows={7}
          className="campo"
          placeholder="Qué pasó, desde cuándo, qué mensaje de error aparece, a quiénes afecta…"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>

      {sugerencias.length > 0 && (
        <div className="rounded-md bg-brand-50 p-3">
          <p className="text-sm font-medium text-brand-700">Quizás esto te resuelve el problema ahora:</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {sugerencias.map((s) => (
              <li key={s.id}>
                <a href={`/kb/${s.id}`} target="_blank" rel="noopener" className="text-brand-700 underline">
                  {s.titulo}
                </a>
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
