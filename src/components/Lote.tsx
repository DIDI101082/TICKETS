'use client'

import { useEffect, useState } from 'react'

/** Barra de acciones en lote: aparece cuando hay tickets tildados en la tabla de la bandeja. */
export default function Lote({
  sectores,
  agentes,
  esAdmin,
}: {
  sectores: { id: string; nombre: string }[]
  agentes: { id: string; nombre: string }[]
  esAdmin: boolean
}) {
  const [n, setN] = useState(0)

  useEffect(() => {
    const form = document.getElementById('lote') as HTMLFormElement | null
    if (!form) return
    const contar = () => setN(form.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length)
    form.addEventListener('change', contar)
    return () => form.removeEventListener('change', contar)
  }, [])

  function todos(marcar: boolean) {
    document.querySelectorAll<HTMLInputElement>('#lote input[name="ids"]').forEach((c) => (c.checked = marcar))
    setN(marcar ? document.querySelectorAll('#lote input[name="ids"]').length : 0)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line/[0.06] px-4 py-2.5 text-sm">
      <button type="button" onClick={() => todos(n === 0)} className="text-brand-600 hover:underline">
        {n === 0 ? 'Seleccionar todos' : 'Quitar selección'}
      </button>
      {n > 0 && (
        <>
          <span className="font-medium">{n} seleccionados:</span>
          <select name="estado" className="campo w-auto py-1" defaultValue="" aria-label="Cambiar estado">
            <option value="">Estado…</option>
            <option value="en_curso">En curso</option>
            <option value="en_espera">En espera</option>
            <option value="resuelto">Resuelto</option>
            <option value="cerrado">Cerrado</option>
          </select>
          <select name="prioridad" className="campo w-auto py-1" defaultValue="" aria-label="Cambiar prioridad">
            <option value="">Prioridad…</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
          <select name="sector_id" className="campo w-auto py-1" defaultValue="" aria-label="Cambiar sector">
            <option value="">Sector…</option>
            <option value="ninguno">Triage</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <select name="asignado_id" className="campo w-auto py-1" defaultValue="" aria-label="Asignar">
            <option value="">Asignar a…</option>
            <option value="yo">A mí</option>
            <option value="nadie">Nadie</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
          {esAdmin && (
            <label className="flex items-center gap-1.5 text-ink/70">
              <input type="checkbox" name="papelera" className="accent-brand-600" /> Enviar a la papelera
            </label>
          )}
          <button className="btn px-3 py-1.5">Aplicar</button>
        </>
      )}
    </div>
  )
}
