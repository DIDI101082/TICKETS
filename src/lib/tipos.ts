export type Rol = 'admin' | 'agente' | 'usuario'
export type Estado = 'abierto' | 'en_curso' | 'en_espera' | 'resuelto' | 'cerrado'
export type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type Canal = 'portal' | 'email' | 'teams'

export const ESTADOS: { valor: Estado; etiqueta: string }[] = [
  { valor: 'abierto', etiqueta: 'Abierto' },
  { valor: 'en_curso', etiqueta: 'En curso' },
  { valor: 'en_espera', etiqueta: 'En espera' },
  { valor: 'resuelto', etiqueta: 'Resuelto' },
  { valor: 'cerrado', etiqueta: 'Cerrado' },
]

export const PRIORIDADES: { valor: Prioridad; etiqueta: string }[] = [
  { valor: 'urgente', etiqueta: 'Urgente' },
  { valor: 'alta', etiqueta: 'Alta' },
  { valor: 'media', etiqueta: 'Media' },
  { valor: 'baja', etiqueta: 'Baja' },
]

export const ACTIVOS: Estado[] = ['abierto', 'en_curso', 'en_espera']

export const etiquetaEstado = (e: string) => ESTADOS.find((x) => x.valor === e)?.etiqueta ?? e
export const etiquetaPrioridad = (p: string) => PRIORIDADES.find((x) => x.valor === p)?.etiqueta ?? p

export interface Perfil {
  id: string
  email: string
  nombre: string
  rol: Rol
  tipo: 'interno' | 'externo'
  organizacion: string
}

export interface Sector {
  id: string
  nombre: string
  descripcion: string
  activo: boolean
  orden: number
}

export interface Ticket {
  id: string
  numero: number
  asunto: string
  descripcion: string
  estado: Estado
  prioridad: Prioridad
  canal: Canal
  sector_id: string | null
  solicitante_id: string | null
  solicitante_email: string
  solicitante_nombre: string
  asignado_id: string | null
  creado_en: string
  actualizado_en: string
  vence_respuesta: string | null
  vence_resolucion: string | null
  primera_respuesta_en: string | null
  resuelto_en: string | null
  en_espera_desde: string | null
  segundos_pausa: number
  ia_sector: string | null
  ia_confianza: number | null
  ia_motivo: string | null
}

export interface Mensaje {
  id: string
  ticket_id: string
  autor_nombre: string
  de_staff: boolean
  interno: boolean
  cuerpo: string
  creado_en: string
}

export interface Adjunto {
  id: string
  ticket_id: string
  mensaje_id: string | null
  nombre: string
  tamano: number
}

export interface Articulo {
  id: string
  titulo: string
  categoria: string
  contenido: string
  visibilidad: 'todos' | 'internos' | 'staff'
  publicado: boolean
  autor_nombre: string
  actualizado_en: string
}
