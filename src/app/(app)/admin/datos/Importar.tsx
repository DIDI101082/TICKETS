'use client'

import { useActionState } from 'react'
import { importar, type ResultadoImportar } from '../acciones2'

export default function Importar() {
  const [resultado, accion, enviando] = useActionState<ResultadoImportar | null, FormData>(importar, null)
  return (
    <form action={accion} className="space-y-3">
      <input type="file" name="archivo" accept=".csv,text/csv" className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-line/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-medium" />
      <textarea name="texto" rows={4} className="campo font-mono text-[13px]" placeholder={'…o pegá acá el contenido:\nasunto;descripcion;estado;prioridad;sector;email;solicitante;creado;resuelto'} />
      <p className="text-xs text-ink/50">
        CSV con encabezado, separado por coma o punto y coma. Solo “asunto” es obligatoria. Fechas como 31/12/2025 14:30 o 2025-12-31. Hasta 2000 filas y 4 MB por vez. Importar dos veces el mismo archivo duplica los tickets.
      </p>
      <button className="btn" disabled={enviando}>{enviando ? 'Importando…' : 'Importar'}</button>
      {resultado && (
        <div className="rounded-lg bg-canvas p-3 text-sm" role="status">
          <p className="font-medium">Se importaron {resultado.importados} tickets.</p>
          {resultado.errores.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink/70">
              {resultado.errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  )
}
