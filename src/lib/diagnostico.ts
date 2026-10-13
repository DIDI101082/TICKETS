// "Arreglalo vos": antes de enviar un pedido, se revisa lo que Accusys Cyber sabe del equipo y de la cuenta
// de la persona y se le muestra qué encontramos y cómo resolverlo. Reglas puras (sin acceso a datos), fáciles de probar.

import type { ContextoCyber, EquipoCyber } from './cyber'
import type { Acceso } from './tipos'

export type TipoDiagnostico = 'equipo' | 'vpn' | 'cuenta'
export const TIPOS_DIAGNOSTICO: { valor: TipoDiagnostico; texto: string }[] = [
  { valor: 'equipo', texto: 'Equipo (lento, se cuelga, no anda)' },
  { valor: 'vpn', texto: 'VPN o conexión' },
  { valor: 'cuenta', texto: 'No puedo entrar (usuario y contraseña)' },
]

export interface Hallazgo {
  id: string
  titulo: string
  detalle: string
  pasos: string[]
  /** alta: casi seguro es la causa · media: puede ser · info: para tener en cuenta */
  gravedad: 'alta' | 'media' | 'info'
  /** false: lo tiene que resolver el equipo de soporte (la persona igual puede enviar el pedido) */
  porVos: boolean
  equipo?: string
}

export interface Diagnostico {
  tipo: TipoDiagnostico
  hallazgos: Hallazgo[]
  probaPrimero: string[]
}

const dias = (d: string | null | undefined, ahora: number) => (d ? Math.floor((ahora - new Date(d).getTime()) / 86400000) : null)
const nombreEquipo = (e: EquipoCyber) => e.codigo || e.hostname || [e.marca, e.modelo].filter(Boolean).join(' ') || 'tu equipo'
const menor = (a: string, b: string) => {
  // Compara mayor.menor (7.0 < 7.2); las compilaciones no importan para el aviso.
  const [a1, a2] = a.split('.').map(Number), [b1, b2] = b.split('.').map(Number)
  return a1 < b1 || (a1 === b1 && (a2 ?? 0) < (b2 ?? 0))
}

function revisarEquipo(e: EquipoCyber, ahora: number, tipo: TipoDiagnostico): Hallazgo[] {
  const h: Hallazgo[] = []
  const nombre = nombreEquipo(e)
  const sinReportar = dias(e.ultimo_reporte, ahora)
  if (sinReportar == null) return h // sin agente: no sabemos nada de este equipo

  if (sinReportar > 7) {
    h.push({ id: `sinreporte:${e.id}`, equipo: nombre, gravedad: 'info', porVos: true,
      titulo: `No tenemos datos de ${nombre} hace ${sinReportar} días`,
      detalle: 'Lo que ves acá puede estar desactualizado. Cuando el equipo se conecta a la red de la oficina o a la VPN, se pone al día solo.',
      pasos: ['Conectalo a la red de la oficina o a la VPN un rato.'] })
  }
  const prendido = dias(e.arranque, ahora)
  if (prendido != null && prendido >= 7) {
    h.push({ id: `uptime:${e.id}`, equipo: nombre, gravedad: tipo === 'equipo' ? 'alta' : 'media', porVos: true,
      titulo: `${nombre} no se reinicia hace ${prendido} días`,
      detalle: 'Es la causa más común de lentitud, cuelgues y problemas de conexión. Apagar y prender no alcanza: Windows "hiberna" y no limpia la memoria.',
      pasos: ['Guardá lo que estés haciendo.', 'Inicio → Encendido → Reiniciar (no "Apagar").', 'Esperá a que termine y probá de nuevo.'] })
  } else if (e.reinicio_pendiente) {
    h.push({ id: `reinicio:${e.id}`, equipo: nombre, gravedad: 'media', porVos: true,
      titulo: `${nombre} tiene actualizaciones esperando un reinicio`,
      detalle: 'Hasta que reinicies, las actualizaciones quedan a medio instalar y pueden hacer que el equipo ande mal.',
      pasos: ['Guardá lo que estés haciendo.', 'Inicio → Encendido → Actualizar y reiniciar.'] })
  }
  if (tipo === 'equipo') {
    for (const d of e.discos ?? []) {
      const total = Number(d.total_gb), libre = Number(d.libre_gb)
      if (!total || !(libre >= 0)) continue
      if (libre / total < 0.1 || libre < 10) {
        h.push({ id: `disco:${e.id}:${d.unidad}`, equipo: nombre, gravedad: libre / total < 0.05 ? 'alta' : 'media', porVos: true,
          titulo: `Te queda poco espacio en ${d.unidad || 'el disco'} (${libre.toFixed(1)} GB libres de ${Math.round(total)} GB)`,
          detalle: 'Con el disco casi lleno Windows se pone lento y las actualizaciones fallan.',
          pasos: [
            'Vaciá la papelera de reciclaje.',
            'Revisá la carpeta Descargas y borrá lo que ya no uses (instaladores, videos, .zip).',
            'Configuración → Sistema → Almacenamiento → Archivos temporales → Quitar archivos.',
            'Si usás OneDrive: clic derecho en una carpeta grande → "Liberar espacio" (queda en la nube).',
          ] })
      }
    }
    const total = Number(e.ram_total_gb), libre = Number(e.ram_libre_gb)
    if (total && libre >= 0 && libre / total < 0.1) {
      h.push({ id: `ram:${e.id}`, equipo: nombre, gravedad: 'media', porVos: true,
        titulo: `La memoria de ${nombre} estaba casi llena la última vez que la vimos`,
        detalle: `Quedaban ${libre.toFixed(1)} GB libres de ${Math.round(total)} GB. Muchas pestañas o programas abiertos hacen que todo vaya lento.`,
        pasos: ['Cerrá los programas y pestañas del navegador que no estés usando.', 'Ctrl + Shift + Esc abre el Administrador de tareas: ordená por "Memoria" para ver qué consume más.'] })
    }
    const parche = dias(e.ultimo_parche, ahora)
    if (parche != null && parche > 45) {
      h.push({ id: `parches:${e.id}`, equipo: nombre, gravedad: 'media', porVos: true,
        titulo: `Windows lleva ${parche} días sin actualizarse en ${nombre}`,
        detalle: 'Las actualizaciones corrigen errores y fallas de seguridad.',
        pasos: ['Configuración → Windows Update → Buscar actualizaciones.', 'Cuando termine, reiniciá.'] })
    }
    if ((e.eset?.abiertas ?? 0) > 0) {
      h.push({ id: `eset:${e.id}`, equipo: nombre, gravedad: 'alta', porVos: false,
        titulo: `El antivirus detectó una amenaza en ${nombre}`,
        detalle: 'Puede tener que ver con lo que te pasa. Ciberseguridad ya está avisado: enviá el pedido igual y no abras archivos desconocidos.',
        pasos: [] })
    } else if (e.antivirus === false) {
      h.push({ id: `av:${e.id}`, equipo: nombre, gravedad: 'media', porVos: false,
        titulo: `El antivirus figura apagado en ${nombre}`,
        detalle: 'Lo tiene que revisar el equipo de soporte. Enviá el pedido.',
        pasos: [] })
    }
  }
  if (tipo === 'vpn' && e.forticlient?.version && e.forticlient.ultima && menor(e.forticlient.version, e.forticlient.ultima)) {
    h.push({ id: `forti:${e.id}`, equipo: nombre, gravedad: 'media', porVos: false,
      titulo: `${e.forticlient.nombre || 'FortiClient'} está desactualizado en ${nombre} (${e.forticlient.version})`,
      detalle: `La versión que usa el resto de la empresa es ${e.forticlient.ultima}. Las versiones viejas suelen fallar al conectar. Enviá el pedido y lo actualizamos.`,
      pasos: [] })
  }
  return h
}

function revisarCuenta(d: ContextoCyber, ahora: number, tipo: TipoDiagnostico): Hallazgo[] {
  const h: Hallazgo[] = []
  if (d.ad?.bloqueada) {
    h.push({ id: 'ad:bloqueada', gravedad: 'alta', porVos: false,
      titulo: 'Tu usuario está bloqueado',
      detalle: 'Pasa después de varios intentos con una contraseña equivocada (a veces la del celular o de una sesión vieja que sigue probando sola). Enviá el pedido y lo desbloqueamos.',
      pasos: ['Mientras tanto, no sigas probando: cada intento vuelve a bloquearlo.', 'Si cambiaste la contraseña hace poco, actualizala también en el celular (correo y Teams).'] })
  }
  if (d.ad && d.ad.habilitada === false) {
    h.push({ id: 'ad:deshabilitada', gravedad: 'alta', porVos: false,
      titulo: 'Tu usuario figura deshabilitado',
      detalle: 'Lo tiene que revisar el equipo de soporte. Enviá el pedido.', pasos: [] })
  }
  const clave = dias(d.ad?.clave_cambiada, ahora)
  if (d.ad && !d.ad.clave_no_vence && clave != null && clave >= 85) {
    h.push({ id: 'ad:clave', gravedad: tipo === 'cuenta' ? 'alta' : 'media', porVos: true,
      titulo: `Cambiaste tu contraseña hace ${clave} días: puede haber vencido`,
      detalle: 'Cuando vence, no podés entrar a la VPN ni a algunos sistemas hasta cambiarla.',
      pasos: ['Cambiala desde https://aka.ms/sspr o, en la oficina, con Ctrl + Alt + Supr → Cambiar una contraseña.', 'Después actualizala en el celular (correo y Teams).'] })
  }
  if (d.m365 && !d.m365.habilitada) {
    h.push({ id: 'm365', gravedad: 'alta', porVos: false,
      titulo: 'Tu cuenta de Microsoft 365 figura deshabilitada',
      detalle: 'Por eso no podés entrar al correo, Teams ni OneDrive. Enviá el pedido.', pasos: [] })
  }
  if (d.mfa && !d.mfa.activo) {
    h.push({ id: 'mfa', gravedad: tipo === 'cuenta' ? 'media' : 'info', porVos: true,
      titulo: 'No tenés configurada la verificación en dos pasos',
      detalle: 'Si al entrar te pide "Se necesita más información", es eso: configurala y vas a poder entrar.',
      pasos: ['Entrá a https://aka.ms/mfasetup y seguí los pasos con la app Microsoft Authenticator en el celular.'] })
  }
  return h
}

function revisarAccesoVpn(accesos: Pick<Acceso, 'sistema' | 'estado' | 'hasta'>[], ahora: number, fueraDeHorario: boolean): Hallazgo[] {
  const vpn = accesos.filter((a) => /vpn/i.test(a.sistema))
  const vigente = vpn.find((a) => a.estado === 'vigente' && (!a.hasta || new Date(a.hasta).getTime() > ahora))
  if (vigente) return []
  const vencido = vpn
    .filter((a) => a.hasta && new Date(a.hasta).getTime() <= ahora && ahora - new Date(a.hasta).getTime() < 30 * 86400000)
    .sort((a, b) => String(b.hasta).localeCompare(String(a.hasta)))[0]
  if (vencido) {
    return [{ id: 'acceso:vpn', gravedad: fueraDeHorario ? 'alta' : 'media', porVos: true,
      titulo: `Tu permiso de "${vencido.sistema}" venció el ${new Date(vencido.hasta!).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`,
      detalle: 'Fuera del horario habitual la VPN solo funciona con ese permiso vigente.',
      pasos: ['Si lo seguís necesitando, pedilo de nuevo desde "Acceso a VPN fuera del horario habitual".'] }]
  }
  if (fueraDeHorario) {
    return [{ id: 'acceso:vpn-horario', gravedad: 'media', porVos: true,
      titulo: 'Estás fuera del horario habitual y no tenés permiso de VPN para este horario',
      detalle: 'Si tu usuario solo tiene VPN en horario laboral, ahora no va a conectar.',
      pasos: ['Pedí el permiso desde "Acceso a VPN fuera del horario habitual".'] }]
  }
  return []
}

const PRIMERO: Record<TipoDiagnostico, string[]> = {
  equipo: ['Reiniciá el equipo (Reiniciar, no Apagar).', 'Si es un programa: cerralo del todo y abrilo de nuevo.', 'Si es la notebook: probá con el cargador conectado.'],
  vpn: [
    'Fijate que tengas internet: abrí cualquier página web.',
    'Cerrá FortiClient del todo (clic derecho en el ícono junto al reloj → Salir) y abrilo de nuevo.',
    'Si estás en un hotel, aeropuerto o bar, probá compartiendo internet desde el celular: muchas redes públicas bloquean la VPN.',
  ],
  cuenta: [
    'Revisá que no esté activado Bloq Mayús y que el teclado esté en el idioma de siempre.',
    'Escribí el usuario completo: nombre@dominio.',
    'Si ves "Se necesita más información", te está pidiendo configurar la verificación en dos pasos.',
  ],
}

const ORDEN = { alta: 0, media: 1, info: 2 }

export function diagnosticar(
  tipo: TipoDiagnostico,
  d: ContextoCyber,
  op: { accesos?: Pick<Acceso, 'sistema' | 'estado' | 'hasta'>[]; fueraDeHorario?: boolean; equipo?: string; ahora?: number } = {},
): Diagnostico {
  const ahora = op.ahora ?? Date.now()
  let equipos = d.equipos ?? []
  // Si eligió un equipo en el formulario, se revisa ese; si no, todos los suyos.
  const elegido = op.equipo?.trim().toLowerCase()
  if (elegido) {
    const uno = equipos.filter((e) => [e.codigo, e.hostname, e.serie].some((v) => v && v.toLowerCase() === elegido))
    if (uno.length) equipos = uno
  }
  const h: Hallazgo[] = []
  if (tipo === 'cuenta' || tipo === 'vpn') h.push(...revisarCuenta(d, ahora, tipo))
  if (tipo === 'vpn') h.push(...revisarAccesoVpn(op.accesos ?? [], ahora, !!op.fueraDeHorario))
  if (tipo === 'equipo' || tipo === 'vpn') for (const e of equipos) h.push(...revisarEquipo(e, ahora, tipo))
  return { tipo, hallazgos: h.sort((a, b) => ORDEN[a.gravedad] - ORDEN[b.gravedad]).slice(0, 8), probaPrimero: PRIMERO[tipo] }
}

/** Texto para la nota interna del ticket: qué vio la persona antes de enviar. */
export function resumenDiagnostico(hallazgos: Hallazgo[]) {
  if (!hallazgos.length) return 'Diagnóstico previo: no se encontró nada en los datos de Accusys Cyber. La persona igual envió el pedido.'
  return ['Diagnóstico previo (lo vio la persona antes de enviar el pedido):', ...hallazgos.map((x) => `- ${x.titulo}${x.porVos ? '' : ' [lo resuelve soporte]'}`)].join('\n')
}
