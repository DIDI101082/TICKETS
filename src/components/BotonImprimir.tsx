'use client'

export default function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-sec print:hidden">
      Imprimir o guardar como PDF
    </button>
  )
}
