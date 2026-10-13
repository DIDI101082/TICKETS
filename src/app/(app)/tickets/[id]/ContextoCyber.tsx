import { contextoDe, cyberConfigurado, type EquipoCyber } from '@/lib/cyber'
import { fecha, soloFecha } from '@/lib/formato'

// Tarjeta lateral de la ficha del ticket: lo que Accusys Cyber sabe de la persona que pide.
// Se carga aparte (con Suspense), así una demora de Cyber no frena la pantalla del ticket.

const dias = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

function Marca({ ok, texto, aviso }: { ok: boolean | null | undefined; texto: string; aviso?: boolean }) {
  const clase = ok == null ? 'bg-ink/5 text-ink/55' : ok ? 'bg-emerald-50 text-emerald-700' : aviso ? 'bg-amber-500/10 text-amber-700' : 'bg-red-50 text-red-700'
  return <span className={`pill ${clase}`}>{texto}</span>
}

function Equipo({ e }: { e: EquipoCyber }) {
  const sinReportar = e.ultimo_reporte ? dias(e.ultimo_reporte) : null
  const cifrado = e.cifrado ? /^cifrad/i.test(e.cifrado) : null
  const eset = e.eset?.abiertas ?? 0
  return (
    <li className="space-y-1 border-t border-line/[0.06] pt-2 first:border-0 first:pt-0">
      <p>
        <span className="font-medium">{e.codigo || e.hostname || 'Equipo'}</span>
        <span className="text-ink/55"> · {[e.categoria, e.marca, e.modelo].filter(Boolean).join(' ')}</span>
      </p>
      {e.so && <p className="text-xs text-ink/55">{e.so}{e.hostname && e.hostname !== e.codigo ? ` · ${e.hostname}` : ''}</p>}
      <div className="flex flex-wrap gap-1">
        {sinReportar == null ? (
          <Marca ok={null} texto="Sin agente" />
        ) : (
          <Marca ok={sinReportar <= 3} aviso texto={sinReportar === 0 ? 'Reportó hoy' : `Reportó hace ${sinReportar} d`} />
        )}
        {e.antivirus != null && <Marca ok={e.antivirus} texto={e.antivirus ? 'Antivirus activo' : 'Antivirus apagado'} />}
        {cifrado != null && <Marca ok={cifrado} aviso texto={cifrado ? 'Disco cifrado' : `Cifrado: ${e.cifrado}`} />}
        {e.reinicio_pendiente && <Marca ok={false} aviso texto="Reinicio pendiente" />}
        {e.eset && <Marca ok={eset === 0} texto={eset === 0 ? 'ESET sin alertas (30 d)' : `ESET: ${eset} sin resolver`} />}
      </div>
      {eset > 0 && e.eset?.ultima && (
        <p className="text-xs text-red-700">Última: {e.eset.ultima.nombre || 'detección'}{e.eset.ultima.severidad ? ` (${e.eset.ultima.severidad.toLowerCase()})` : ''} · {fecha(e.eset.ultima.fecha)}</p>
      )}
    </li>
  )
}

export default async function ContextoCyber({ email, ticketNumero }: { email: string; ticketNumero: number }) {
  if (!cyberConfigurado()) return null
  const { datos: d, error } = await contextoDe(email, `#${ticketNumero}`)
  const base = (process.env.NEXT_PUBLIC_CYBER_URL || '').replace(/\/$/, '')

  if (error) {
    return (
      <div className="tarjeta space-y-1 p-4 text-sm">
        <h2>Accusys Cyber</h2>
        <p className="text-ink/60">{error}</p>
      </div>
    )
  }
  // Clientes externos y cuentas que Cyber no conoce: no se muestra nada.
  if (!d || (!d.encontrado && !d.mfa && !d.ad && !d.m365)) return null

  const ad = d.ad
  return (
    <div className="tarjeta space-y-3 p-4 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2>Accusys Cyber</h2>
        {base && d.empleado && (
          <a href={`${base}/empleados/${d.empleado.id}`} target="_blank" rel="noopener" className="text-xs text-brand-600 hover:underline">Ver ficha</a>
        )}
      </div>

      {d.empleado && (
        <div>
          <p className="font-medium">{d.empleado.nombre}</p>
          <p className="text-ink/60">{[d.empleado.puesto, d.empleado.area].filter(Boolean).join(' · ') || 'Sin área cargada'}</p>
          {!d.empleado.activo && <p className="mt-1"><Marca ok={false} texto="Dado de baja en Empleados" /></p>}
        </div>
      )}

      {(ad || d.mfa || d.m365) && (
        <div className="space-y-1">
          <p className="text-xs text-ink/50">Cuentas</p>
          <div className="flex flex-wrap gap-1">
            {ad && <Marca ok={ad.habilitada !== false && !ad.bloqueada} texto={ad.bloqueada ? 'AD: bloqueada' : ad.habilitada === false ? 'AD: deshabilitada' : 'AD: activa'} />}
            {d.mfa && <Marca ok={d.mfa.activo} texto={d.mfa.activo ? 'MFA activo' : 'Sin MFA'} />}
            {d.mfa?.admin && <Marca ok={null} texto="Rol de administrador" />}
            {d.m365 && <Marca ok={d.m365.habilitada} texto={d.m365.habilitada ? 'Microsoft 365 activa' : 'Microsoft 365 deshabilitada'} />}
          </div>
          {ad && (ad.ultimo_ingreso || ad.clave_cambiada) && (
            <p className="text-xs text-ink/55">
              {ad.usuario}
              {ad.ultimo_ingreso ? ` · último ingreso ${soloFecha(ad.ultimo_ingreso)}` : ''}
              {ad.clave_cambiada ? ` · clave cambiada ${soloFecha(ad.clave_cambiada)}` : ''}
              {ad.clave_no_vence ? ' · la clave no vence' : ''}
            </p>
          )}
          {d.mfa?.activo && d.mfa.metodos?.length > 0 && <p className="text-xs text-ink/55">MFA: {d.mfa.metodos.join(', ')}</p>}
        </div>
      )}

      {d.equipos && (
        <div className="space-y-1">
          <p className="text-xs text-ink/50">Equipos asignados</p>
          {d.equipos.length === 0 ? <p className="text-ink/60">No tiene equipos asignados.</p> : <ul className="space-y-2">{d.equipos.map((e) => <Equipo key={e.id} e={e} />)}</ul>}
        </div>
      )}

      {d.licencias && d.licencias.length > 0 && (
        <div>
          <p className="text-xs text-ink/50">Licencias</p>
          <p className="text-ink/75">{d.licencias.join(' · ')}</p>
        </div>
      )}
    </div>
  )
}
