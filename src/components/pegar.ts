import type { ClipboardEvent } from 'react'

/**
 * Permite pegar capturas de pantalla (Ctrl+V) en un cuadro de texto:
 * las imágenes del portapapeles se suman a los archivos del campo de adjuntos.
 * Devuelve cuántos archivos quedaron, o null si no se pegó ninguna imagen.
 */
export function pegarImagenes(e: ClipboardEvent, campo: HTMLInputElement | null): number | null {
  const imagenes = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
  if (!imagenes.length || !campo) return null
  e.preventDefault()
  try {
    const dt = new DataTransfer()
    for (const f of campo.files ?? []) dt.items.add(f)
    const sello = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
    imagenes.forEach((f, i) => {
      const ext = f.type.split('/')[1] || 'png'
      dt.items.add(new File([f], `captura-${sello}${i ? `-${i + 1}` : ''}.${ext}`, { type: f.type }))
    })
    campo.files = dt.files
    return dt.files.length
  } catch {
    return null
  }
}
