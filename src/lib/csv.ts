export function celda(v: unknown) {
  let s = v == null ? '' : String(v)
  // Evita que Excel interprete el contenido como fórmula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

/** CSV con BOM y punto y coma: Excel en español lo abre directo, con acentos. */
export function comoCsv(cabecera: string[], filas: unknown[][], nombre: string) {
  const csv = '﻿' + [cabecera, ...filas].map((f) => f.map(celda).join(';')).join('\r\n')
  const dia = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}-${dia}.csv"` },
  })
}
