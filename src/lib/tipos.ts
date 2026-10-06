export type Rol = 'admin' | 'agente' | 'usuario'
export type Estado = 'abierto' | 'en_curso' | 'en_espera' | 'resuelto' | 'cerrado'
export type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type Canal = 'portal' | 'email' | 'teams' | 'monitoreo' | 'programado'
export type Aprobacion = 'no_requiere' | 'pendiente' | 'aprobado' | 'rechazado'

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
  organizacion_id: string | null
  ve_organizacion: boolean
  avisos_mail: 'todo' | 'resuelto' | 'nada'
}

export interface Sector {
  id: string
  nombre: string
  descripcion: string
  activo: boolean
  orden: number
  responsable_id: string | null
}

export interface Organizacion {
  id: string
  nombre: string
  dominios: string
  activo: boolean
}

export interface Campo {
  etiqueta: string
  tipo: 'texto' | 'parrafo' | 'lista'
  opciones: string[]
  requerido: boolean
}

export interface Categoria {
  id: string
  nombre: string
  descripcion: string
  sector_id: string | null
  prioridad: Prioridad | null
  campos: Campo[]
  requiere_aprobacion: boolean
  confidencial: boolean
  activo: boolean
  orden: number
}

export interface Dato {
  etiqueta: string
  valor: string
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
  organizacion_id: string | null
  categoria_id: string | null
  datos: Dato[]
  equipo: string
  confidencial: boolean
  padre_id: string | null
  fusionado_en_id: string | null
  aprobacion_estado: Aprobacion
  aprobador_id: string | null
  aprobacion_nota: string
  aprobacion_en: string | null
  csat_puntaje: number | null
  csat_comentario: string
  resumen: string | null
  resumen_en: string | null
  escalado_en: string | null
  incidente: boolean
  clave_externa: string | null
  impacto: string
  urgencia: string
  beneficiario_id: string | null
  beneficiario_nombre: string
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

export interface Horario {
  activo: boolean
  dias: number[]
  desde: string
  hasta: string
  zona: string
}

export interface Opciones {
  restringir_sector: boolean
  escalar_sin_tomar_min: number
  incidente_cantidad: number
  incidente_minutos: number
}

export const HORARIO_INICIAL: Horario = { activo: false, dias: [1, 2, 3, 4, 5], desde: '09:00', hasta: '18:00', zona: 'America/Argentina/Buenos_Aires' }
export const OPCIONES_INICIALES: Opciones = { restringir_sector: false, escalar_sin_tomar_min: 120, incidente_cantidad: 4, incidente_minutos: 30 }

// Impacto y urgencia que declara quien carga el pedido. Con los dos se propone una prioridad.
export const IMPACTOS = [
  { valor: 'yo', etiqueta: 'Solo a mí' },
  { valor: 'equipo', etiqueta: 'A mi equipo' },
  { valor: 'empresa', etiqueta: 'A toda el área o la empresa' },
]
export const URGENCIAS = [
  { valor: 'puede_esperar', etiqueta: 'Puede esperar', ayuda: 'Es una consulta o un pedido sin fecha.' },
  { valor: 'complica', etiqueta: 'Me complica el trabajo', ayuda: 'Puedo seguir, pero con dificultad o con una alternativa.' },
  { valor: 'bloqueado', etiqueta: 'No puedo trabajar', ayuda: 'Estoy frenado hasta que se resuelva.' },
]

export function prioridadPorImpacto(impacto?: string | null, urgencia?: string | null): Prioridad | null {
  const i = IMPACTOS.findIndex((x) => x.valor === impacto)
  const u = URGENCIAS.findIndex((x) => x.valor === urgencia)
  if (i < 0 || u < 0) return null
  return (['baja', 'media', 'media', 'alta', 'urgente'] as Prioridad[])[i + u]
}

export const etiquetaImpacto = (v: string) => IMPACTOS.find((x) => x.valor === v)?.etiqueta ?? ''
export const etiquetaUrgencia = (v: string) => URGENCIAS.find((x) => x.valor === v)?.etiqueta ?? ''

export interface Servicio {
  id: string
  nombre: string
  estado: 'operativo' | 'degradado' | 'caido'
  mensaje: string
  orden: number
  actualizado_en: string
}
