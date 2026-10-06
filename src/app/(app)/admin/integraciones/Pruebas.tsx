'use client'

import { useActionState } from 'react'
import { probar } from '../acciones2'

export default function Pruebas() {
  const [resultado, accion, probando] = useActionState<string | null, FormData>(probar, null)
  return (
    <form action={accion} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button name="cual" value="ia" className="btn-sec" disabled={probando}>Probar la IA</button>
        <button name="cual" value="mail" className="btn-sec" disabled={probando}>Enviarme un mail de prueba</button>
        <button name="cual" value="teams" className="btn-sec" disabled={probando}>Enviar un aviso de prueba a Teams</button>
      </div>
      {(probando || resultado) && (
        <p className="rounded-lg bg-canvas px-3 py-2 text-sm" role="status">{probando ? 'Probando…' : resultado}</p>
      )}
    </form>
  )
}
