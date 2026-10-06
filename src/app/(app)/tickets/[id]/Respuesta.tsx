'use client'

import { useRef, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { pegarImagenes } from '@/components/pegar'
import { borradorIA, responder } from './acciones'

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button className="btn" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar'}
    </button>
  )
}

export default function Respuesta({
  ticketId,
  staff,
  plantillas,
  ia,
}: {
  ticketId: string
  staff: boolean
  plantillas: { id: string; titulo: string; cuerpo: string; estado_tras: string; nota_interna: boolean }[]
  ia: boolean
}) {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const [pensando, iniciar] = useTransition()
  const archivos = useRef<HTMLInputElement>(null)
  const [pegados, setPegados] = useState(0)
  const [tras, setTras] = useState('')
  const [interno, setInterno] = useState(false)

  function pedirBorrador() {
    setAviso('')
    iniciar(async () => {
      const r = await borradorIA(ticketId)
      if (r.texto) {
        setTexto(r.texto)
        setAviso('Borrador generado por IA: revisalo antes de enviar.')
      } else setAviso(r.error ?? 'No se pudo generar el borrador.')
    })
  }

  return (
    <form action={responder.bind(null, ticketId)} className="tarjeta space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="rotulo !mb-0" htmlFor="cuerpo">Responder</label>
        {staff && (
          <div className="flex flex-wrap items-center gap-2">
            {plantillas.length > 0 && (
              <select
                className="campo w-auto py-1"
                value=""
                aria-label="Insertar respuesta predefinida"
                onChange={(e) => {
                  const p = plantillas.find((x) => x.id === e.target.value)
                  if (!p) return
                  setTexto((t) => (t ? `${t}\n\n${p.cuerpo}` : p.cuerpo))
                  // Una respuesta predefinida puede traer además qué hacer con el ticket (macro).
                  if (p.estado_tras) setTras(p.estado_tras)
                  if (p.nota_interna) setInterno(true)
                }}
              >
                <option value="">Respuesta predefinida…</option>
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>{p.titulo}</option>
                ))}
              </select>
            )}
            {ia && (
              <button type="button" onClick={pedirBorrador} disabled={pensando} className="btn-sec px-3 py-1">
                {pensando ? 'Redactando…' : 'Borrador con IA'}
              </button>
            )}
          </div>
        )}
      </div>
      <textarea id="cuerpo" name="cuerpo" rows={6} className="campo" placeholder="Escribí tu respuesta… Podés pegar capturas de pantalla con Ctrl+V."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onPaste={(e) => {
          const n = pegarImagenes(e, archivos.current)
          if (n) setPegados(n)
        }}
      />
      {pegados > 0 && <p className="text-xs text-ink/55" role="status">Captura agregada a los adjuntos ({pegados} en total).</p>}
      {aviso && <p className="text-xs text-ink/55" role="status">{aviso}</p>}
      <input ref={archivos} name="archivos" type="file" multiple className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-line/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-medium" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Enviar />
        {staff && (
          <>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="interno" checked={interno} onChange={(e) => setInterno(e.target.checked)} className="accent-brand-600" /> Nota interna (no la ve el solicitante; con @nombre avisás a un compañero)
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              Después de enviar:
              <select name="estado_tras" className="campo w-auto py-1" value={tras} onChange={(e) => setTras(e.target.value)}>
                <option value="">dejar en curso</option>
                <option value="en_espera">pasar a En espera</option>
                <option value="resuelto">marcar Resuelto</option>
              </select>
            </label>
          </>
        )}
      </div>
    </form>
  )
}
