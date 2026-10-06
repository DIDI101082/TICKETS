'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Mark from './Mark'
import { alternarTema, estaOscuro } from '@/lib/tema'
import { marcarLeidas } from '@/app/(app)/acciones'

export interface Aviso {
  id: string
  ticket_id: string | null
  texto: string
  leida: boolean
  creado_en: string
}

const ROL: Record<string, string> = { admin: 'Administrador', agente: 'Agente', usuario: 'Usuario' }

interface Pagina {
  href: string
  label: string
}
interface Solapa extends Pagina {
  // rutas que también pertenecen a esta solapa
  tambien?: string[]
  // páginas de la solapa: se muestran en una segunda fila, como en Accusys Cyber
  paginas?: Pagina[]
}

function iniciales(nombre: string) {
  const base = nombre.includes('@') ? nombre.split('@')[0].replace(/[._-]+/g, ' ') : nombre
  const p = base.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] ?? '')).toUpperCase() || '?'
}

const dentro = (pathname: string, ruta: string) => pathname === ruta || pathname.startsWith(ruta + '/')

export default function Nav({ nombre, email, rol, avisos, sinLeer }: { nombre: string; email: string; rol: string; avisos: Aviso[]; sinLeer: number }) {
  const pathname = usePathname()
  const staff = rol !== 'usuario'

  const solapas: Solapa[] = staff
    ? [
        { href: '/agente', label: 'Bandeja', tambien: ['/tickets'] },
        {
          href: '/tablero',
          label: 'Tablero',
          paginas: [
            { href: '/tablero', label: 'Situación actual' },
            { href: '/tablero/reportes', label: 'Reportes por período' },
          ],
        },
        {
          href: '/kb',
          label: 'Conocimiento',
          tambien: ['/plantillas', '/estado'],
          paginas: [
            { href: '/kb', label: 'Artículos' },
            { href: '/plantillas', label: 'Respuestas predefinidas' },
            { href: '/estado', label: 'Estado de servicios' },
          ],
        },
        ...(rol === 'admin'
          ? [
              {
                href: '/admin',
                label: 'Administración',
                paginas: [
                  { href: '/admin', label: 'General' },
                  { href: '/admin/categorias', label: 'Categorías' },
                  { href: '/admin/organizaciones', label: 'Organizaciones' },
                  { href: '/admin/personas', label: 'Personas' },
                  { href: '/admin/programados', label: 'Programados' },
                  { href: '/admin/auditoria', label: 'Auditoría' },
                ],
              },
            ]
          : []),
      ]
    : [
        { href: '/portal', label: 'Inicio', tambien: ['/tickets'] },
        { href: '/kb', label: 'Ayuda' },
        { href: '/estado', label: 'Estado de servicios' },
      ]

  const activa = solapas.find((s) => [s.href, ...(s.tambien ?? [])].some((r) => dentro(pathname, r)))
  // La página actual es la de ruta más larga que coincide (así /admin no queda marcada estando en /admin/personas).
  const paginaActual = [...(activa?.paginas ?? [])].sort((a, b) => b.href.length - a.href.length).find((p) => dentro(pathname, p.href))

  return (
    <header className="border-b border-line/[0.06] bg-surface print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 sm:gap-x-5 sm:px-6 md:flex-nowrap">
        <Link href="/" className="flex shrink-0 items-end gap-1.5 md:pb-2" aria-label="Inicio">
          <Mark className="h-6" />
          <span className="font-display text-lg font-extrabold leading-none tracking-tight text-brand-600">Tickets</span>
        </Link>

        <div className="min-w-0 flex-1 border-line/10 max-md:order-last max-md:basis-full md:border-l md:pl-4">
          <div role="tablist" aria-label="Secciones" className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {solapas.map((s) => {
              const sel = s === activa
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  role="tab"
                  aria-selected={sel}
                  className={`-mb-px shrink-0 whitespace-nowrap rounded-t-lg border-x border-t px-2.5 py-2 font-display text-sm font-bold tracking-tight transition-colors 2xl:text-[15px] ${
                    sel ? 'border-line/[0.06] bg-canvas text-ink' : 'border-transparent text-ink/45 hover:text-ink'
                  }`}
                >
                  {s.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 max-md:ml-auto md:pb-2">
          <Link href="/portal/nuevo" className="btn px-3 py-1.5">
            Nuevo ticket
          </Link>
          <Campana avisos={avisos} sinLeer={sinLeer} />
          <MenuUsuario nombre={nombre || email} email={email} rol={rol} />
        </div>
      </div>

      {activa?.paginas && (
        <nav className="border-t border-line/[0.06] bg-canvas" aria-label={`Páginas de ${activa.label}`}>
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
            {activa.paginas.map((p) => {
              const actual = p === paginaActual
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={actual ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    actual ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink/60 hover:bg-surface/60 hover:text-ink'
                  }`}
                >
                  {p.label}
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </header>
  )
}

function MenuUsuario({ nombre, email, rol }: { nombre: string; email: string; rol: string }) {
  const [abierto, setAbierto] = useState(false)
  const [oscuro, setOscuro] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setOscuro(estaOscuro()), [])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-label={`Cuenta de ${nombre}`}
        className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 font-display text-xs font-bold text-brand-700 transition-colors hover:bg-brand-100"
      >
        {iniciales(nombre)}
      </button>
      {abierto && (
        <div className="tarjeta absolute right-0 z-50 mt-2 w-60 p-1.5 shadow-lg">
          <div className="border-b border-line/[0.06] px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-medium">{nombre}</p>
            <p className="truncate text-xs text-ink/50">{email}</p>
            <p className="mt-0.5 text-xs text-ink/50">{ROL[rol] ?? rol}</p>
          </div>
          {rol !== 'usuario' && (
            <Link href="/portal" onClick={() => setAbierto(false)} className="mt-1 block rounded-md px-2.5 py-1.5 text-sm text-ink/70 hover:bg-line/[0.04] hover:text-ink">
              Mis pedidos y aprobaciones
            </Link>
          )}
          <Link href="/cuenta" onClick={() => setAbierto(false)} className="mt-1 block rounded-md px-2.5 py-1.5 text-sm text-ink/70 hover:bg-line/[0.04] hover:text-ink">
            Mi cuenta y avisos
          </Link>
          <button
            type="button"
            onClick={() => setOscuro(alternarTema())}
            className="mt-1 block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink/70 hover:bg-line/[0.04] hover:text-ink"
          >
            {oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
          </button>
          <form action="/auth/salir" method="post">
            <button className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink/70 hover:bg-line/[0.04] hover:text-ink">Cerrar sesión</button>
          </form>
        </div>
      )}
    </div>
  )
}

function hace(d: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.floor(min / 1440)} d`
}

function Campana({ avisos, sinLeer }: { avisos: Aviso[]; sinLeer: number }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-label={sinLeer ? `Notificaciones: ${sinLeer} sin leer` : 'Notificaciones'}
        className="relative grid h-8 w-8 place-items-center rounded-full text-ink/60 transition-colors hover:bg-line/[0.05] hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {sinLeer > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>
      {abierto && (
        <div className="tarjeta absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] p-1.5 shadow-lg">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <p className="text-sm font-medium">Novedades</p>
            {sinLeer > 0 && (
              <form action={marcarLeidas}>
                <button className="text-xs text-brand-600 hover:underline">Marcar todas como leídas</button>
              </form>
            )}
          </div>
          {avisos.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-sm text-ink/55">No hay novedades.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {avisos.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.ticket_id ? `/tickets/${a.ticket_id}` : '/portal'}
                    onClick={() => setAbierto(false)}
                    className={`block rounded-md px-2.5 py-2 text-sm hover:bg-line/[0.04] ${a.leida ? 'text-ink/60' : 'font-medium text-ink'}`}
                  >
                    {a.texto}
                    <span className="block text-xs font-normal text-ink/45">{hace(a.creado_en)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
