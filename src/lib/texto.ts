// Utilidades de texto compartidas: palabras clave para sugerencias, tickets parecidos e incidentes.
const VACIAS = new Set([
  'para', 'pero', 'como', 'cuando', 'desde', 'tengo', 'puedo', 'esta', 'este', 'esto', 'porque', 'hola', 'gracias',
  'necesito', 'quiero', 'favor', 'sobre', 'tiene', 'hace', 'hacer', 'anda', 'funciona', 'problema', 'error', 'ayuda',
  'pedido', 'consulta', 'ticket', 'urgente', 'buenas', 'tardes', 'dias', 'buen', 'todo', 'todos', 'algo', 'nada',
  'that', 'with', 'from', 'this', 'have',
])

export function claves(texto: string): string[] {
  const limpio = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return [...new Set(limpio.split(/[^a-z0-9]+/).filter((p) => p.length > 3 && !VACIAS.has(p)))]
}

export function coincidencias(a: string[], b: string[]) {
  const s = new Set(b)
  return a.filter((x) => s.has(x)).length
}

/** Reemplaza {{nombre}}, {{numero}} y {{asunto}} en una plantilla. */
export function rellenar(texto: string, v: Record<string, string>) {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (todo, k: string) => v[k] ?? todo)
}
