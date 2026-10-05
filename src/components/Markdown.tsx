import type { ReactNode } from 'react'

// Render mínimo y seguro (sin HTML crudo): títulos, listas, negrita, enlaces y párrafos.
function enLinea(texto: string, clave: string): ReactNode[] {
  const partes: ReactNode[] = []
  const patron = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = patron.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    if (m[1]) partes.push(<strong key={`${clave}-${i}`}>{m[1]}</strong>)
    else if (m[2])
      partes.push(
        <a key={`${clave}-${i}`} href={m[3]} target="_blank" rel="noopener noreferrer" className="text-marca underline">
          {m[2]}
        </a>,
      )
    else if (m[4])
      partes.push(
        <code key={`${clave}-${i}`} className="rounded bg-black/[0.06] px-1 py-0.5 text-[0.9em]">
          {m[4]}
        </code>,
      )
    ultimo = m.index + m[0].length
    i++
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

export default function Markdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r/g, '').split('\n')
  const bloques: ReactNode[] = []
  let lista: { ordenada: boolean; items: string[] } | null = null
  let parrafo: string[] = []

  const cerrar = () => {
    const k = bloques.length
    if (parrafo.length) {
      bloques.push(
        <p key={k} className="leading-relaxed">
          {enLinea(parrafo.join(' '), `p${k}`)}
        </p>,
      )
      parrafo = []
    }
    if (lista) {
      const Etiqueta = lista.ordenada ? 'ol' : 'ul'
      bloques.push(
        <Etiqueta key={`l${k}`} className={`${lista.ordenada ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
          {lista.items.map((it, j) => (
            <li key={j}>{enLinea(it, `l${k}-${j}`)}</li>
          ))}
        </Etiqueta>,
      )
      lista = null
    }
  }

  for (const cruda of lineas) {
    const l = cruda.trim()
    const titulo = l.match(/^(#{1,3})\s+(.*)$/)
    const vineta = l.match(/^[-*]\s+(.*)$/)
    const numero = l.match(/^\d+[.)]\s+(.*)$/)
    if (!l) cerrar()
    else if (titulo) {
      cerrar()
      const k = bloques.length
      bloques.push(
        titulo[1].length === 1 ? (
          <h2 key={k} className="pt-2 text-lg font-semibold">{enLinea(titulo[2], `h${k}`)}</h2>
        ) : (
          <h3 key={k} className="pt-1 font-semibold">{enLinea(titulo[2], `h${k}`)}</h3>
        ),
      )
    } else if (vineta || numero) {
      if (parrafo.length) cerrar()
      const ordenada = !!numero
      if (lista && lista.ordenada !== ordenada) cerrar()
      lista = lista ?? { ordenada, items: [] }
      lista.items.push((vineta ?? numero)![1])
    } else {
      if (lista) cerrar()
      parrafo.push(l)
    }
  }
  cerrar()
  return <div className="space-y-3 text-sm">{bloques}</div>
}
