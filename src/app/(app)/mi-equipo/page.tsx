import Link from 'next/link'
import { Suspense } from 'react'
import { sesion } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { cyberConfigurado } from '@/lib/cyber'
import { fecha } from '@/lib/formato'
import { politicasDe } from '@/lib/politicas'
import { proximaRecertificacion, type Acceso } from '@/lib/tipos'
import Cumplimiento from './Cumplimiento'
import { quitarAccesoEquipo, recordarPoliticas, sigueHaciendoFalta } from './acciones'

// "Mi equipo": para quien tiene gente a cargo (jefe directo en Personas).
// Accesos de su gente, qué falta reconfirmar, políticas y capacitaciones pendientes, y pedidos de alta, baja o cambio en un clic.

interface Persona { id: string; nombre: string; email: string; tipo: 'interno' | 'externo'; area: string; puesto: string }

export default async function MiEquipo({ searchParams }: { searchParams: Promise<{ ok?: string; recordados?: string }> }) {
  const sp = await searchParams
  const { db, perfil } = await sesion()
  const sa = admin()
  const { data: rg } = await sa.from('perfiles').select('id,nombre,email,tipo,area,puesto').eq('jefe_id', perfil.id).eq('activo', true).order('nombre')
  const gente = (rg ?? []) as Persona[]

  if (!gente.length) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1>Mi equipo</h1>
        <p className="tarjeta p-6 text-sm text-ink/60">No figura nadie a tu cargo. El jefe de cada persona se toma de Microsoft 365 (Entra ID) o lo carga un administrador en Personas.</p>
      </div>
    )
  }

  const ids = gente.map((g) => g.id)
  const [{ data: racc }, { data: rcat }, { count: aprobar }, { data: rcats }, polis] = await Promise.all([
    sa.from('accesos').select('*').in('persona_id', ids).neq('estado', 'revocado').order('hasta', { ascending: true, nullsFirst: false }),
    sa.from('categorias').select('id,recertificar_dias'),
    db.from('tickets').select('id', { count: 'exact', head: true }).eq('aprobador_id', perfil.id).eq('aprobacion_estado', 'pendiente'),
    db.from('categorias').select('id,nombre').eq('activo', true),
    Promise.all(gente.map((g) => politicasDe(sa, g))),
  ])
  const accesos = (racc ?? []) as Acceso[]
  const diasDe = new Map((rcat ?? []).map((c) => [c.id as string, Number(c.recertificar_dias) || 90]))
  const ahora = Date.now()
  const aReconfirmar = (a: Acceso) => a.estado === 'vigente' && !a.hasta && proximaRecertificacion(a, diasDe.get(a.categoria_id ?? '') ?? 90).getTime() <= ahora
  const pendientesDe = new Map(gente.map((g, i) => [g.id, polis[i].pendientes]))
  const conPoliticas = gente.filter((g) => (pendientesDe.get(g.id)?.length ?? 0) > 0).length
  const porVencer = accesos.filter((a) => a.estado === 'vigente' && a.hasta && new Date(a.hasta).getTime() - ahora < 7 * 86400000).length
  const reconfirmar = accesos.filter(aReconfirmar).length

  const cat = (re: RegExp) => (rcats ?? []).find((c) => re.test(String(c.nombre)))?.id
  const pedir = (re: RegExp, persona?: Persona) => {
    const id = cat(re)
    return `/portal/nuevo${id ? `?cat=${id}` : ''}${persona ? `${id ? '&' : '?'}persona=${encodeURIComponent(persona.email)}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Mi equipo</h1>
          <p className="text-sm text-ink/60">Las {gente.length} personas a tu cargo: sus accesos, lo que tienen pendiente de seguridad y los pedidos de alta, baja o cambio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={pedir(/^alta de usuario/i)} className="btn">Pedir alta de alguien nuevo</Link>
        </div>
      </div>

      {sp.ok === 'quitar' && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Listo: pedimos quitar ese acceso.</p>}
      {sp.ok === 'sigue' && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Listo: quedó reconfirmado.</p>}
      {sp.recordados != null && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Enviamos {sp.recordados} recordatorios.</p>}
      {(aprobar ?? 0) > 0 && (
        <Link href="/portal?ver=aprobar" className="block rounded-xl border border-brand-500 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <strong>Tenés {aprobar} {aprobar === 1 ? 'pedido' : 'pedidos'} para aprobar.</strong> Revisarlos →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tarjeta p-4"><p className="text-xs text-ink/55">Personas</p><p className="font-display text-2xl tabular-nums">{gente.length}</p></div>
        <div className="tarjeta p-4"><p className="text-xs text-ink/55">Accesos vigentes</p><p className="font-display text-2xl tabular-nums">{accesos.filter((a) => a.estado === 'vigente').length}</p>{porVencer > 0 && <p className="text-xs text-amber-700">{porVencer} vencen esta semana</p>}</div>
        <div className="tarjeta p-4"><p className="text-xs text-ink/55">Accesos para reconfirmar</p><p className={`font-display text-2xl tabular-nums ${reconfirmar ? 'text-amber-700' : ''}`}>{reconfirmar}</p></div>
        <div className="tarjeta p-4">
          <p className="text-xs text-ink/55">Con políticas sin aceptar</p>
          <p className={`font-display text-2xl tabular-nums ${conPoliticas ? 'text-amber-700' : ''}`}>{conPoliticas}</p>
          {conPoliticas > 0 && <form action={recordarPoliticas}><button className="text-xs text-brand-600 hover:underline">Mandarles un recordatorio</button></form>}
        </div>
      </div>

      <ul className="space-y-3">
        {gente.map((g) => {
          const suyos = accesos.filter((a) => a.persona_id === g.id)
          const pols = pendientesDe.get(g.id) ?? []
          return (
            <li key={g.id} className="tarjeta space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{g.nombre || g.email}</p>
                  <p className="text-xs text-ink/50">{[g.puesto, g.area].filter(Boolean).join(' · ') || g.email}</p>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <Link href={pedir(/modificaci[oó]n de usuario/i, g)} className="text-brand-600 hover:underline">Pedir un permiso o programa</Link>
                  <Link href={pedir(/cambio de [aá]rea/i, g)} className="text-brand-600 hover:underline">Cambio de área</Link>
                  <Link href={pedir(/^baja de usuario/i, g)} className="text-ink/55 hover:text-red-700">Pedir la baja</Link>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {cyberConfigurado() && (
                  <Suspense fallback={<span className="text-xs text-ink/45">Revisando…</span>}>
                    <Cumplimiento email={g.email} />
                  </Suspense>
                )}
                {pols.length > 0 ? (
                  <span className="pill bg-amber-500/10 text-amber-700" title={pols.map((p) => p.titulo).join(', ')}>⚠ {pols.length} política{pols.length === 1 ? '' : 's'} sin aceptar</span>
                ) : (
                  <span className="pill bg-emerald-50 text-emerald-700">✓ Políticas al día</span>
                )}
              </div>

              {suyos.length > 0 && (
                <ul className="divide-y divide-line/[0.06] rounded-lg border border-line/[0.08]">
                  {suyos.map((a) => {
                    const dias = a.hasta ? Math.ceil((new Date(a.hasta).getTime() - ahora) / 86400000) : null
                    const recert = aReconfirmar(a)
                    return (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span>
                          {a.sistema}
                          <span className={`ml-2 text-xs ${recert || (dias != null && dias <= 7) ? 'text-amber-700' : 'text-ink/50'}`}>
                            {a.estado === 'revocacion_pendiente' ? 'Se está quitando' : a.hasta ? `vence el ${fecha(a.hasta)}` : recert ? 'sin fecha de fin · hay que reconfirmarlo' : 'sin fecha de fin'}
                          </span>
                        </span>
                        {a.estado === 'vigente' && (
                          <span className="flex gap-3 text-xs">
                            {recert && <form action={sigueHaciendoFalta.bind(null, a.id)}><button className="text-brand-600 hover:underline">Sigue haciendo falta</button></form>}
                            <form action={quitarAccesoEquipo.bind(null, a.id)}><button className="text-ink/55 hover:text-red-700">Ya no lo necesita</button></form>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-ink/45">Ves a las personas que te tienen como jefe (según Microsoft 365 o lo cargado en Personas) y que ya entraron a Desk al menos una vez.</p>
    </div>
  )
}
