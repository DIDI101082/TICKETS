'use client'

import { useActionState } from 'react'
import { crearPersonas, type ResultadoAlta } from '../acciones2'

export default function Alta() {
  const [resultado, accion, enviando] = useActionState<ResultadoAlta | null, FormData>(crearPersonas, null)
  return (
    <details className="rounded-xl border border-dashed border-line/20 p-4">
      <summary className="cursor-pointer font-display font-bold">Crear cuentas</summary>
      <form action={accion} className="mt-3 space-y-3">
        <textarea name="lineas" rows={4} required className="campo font-mono text-[13px]" placeholder={'ana@empresa.com, Ana Pérez, usuario\njuan@empresa.com, Juan Gómez, agente'} />
        <p className="text-xs text-ink/50">
          Una persona por línea: mail, nombre, rol (usuario, agente o admin). Podés pegar las filas de un Excel. No se envía ningún mail: cada cuenta se crea con una clave temporal que aparece acá abajo una sola vez.
        </p>
        <button className="btn" disabled={enviando}>{enviando ? 'Creando…' : 'Crear cuentas'}</button>
      </form>
      {resultado && (
        <div className="mt-4 space-y-2" role="status">
          <p className="text-sm font-medium">Copiá las claves ahora: no se vuelven a mostrar.</p>
          <table className="tabla">
            <thead>
              <tr>
                <th>Mail</th>
                <th>Clave temporal</th>
              </tr>
            </thead>
            <tbody>
              {resultado.filas.map((f) => (
                <tr key={f.email}>
                  <td>{f.email}</td>
                  <td>{f.clave ? <code className="select-all rounded bg-line/[0.06] px-1.5 py-0.5">{f.clave}</code> : <span className="text-red-700">{f.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
