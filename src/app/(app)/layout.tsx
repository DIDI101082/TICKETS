import Link from 'next/link'
import { sesion } from '@/lib/auth'
import { APP_NOMBRE } from '@/lib/formato'

export default async function Marco({ children }: { children: React.ReactNode }) {
  const { perfil, staff, esAdmin } = await sesion()

  const enlaces = staff
    ? [
        { href: '/agente', texto: 'Bandeja' },
        { href: '/tablero', texto: 'Tablero' },
        { href: '/kb', texto: 'Base de conocimiento' },
        ...(esAdmin ? [{ href: '/admin', texto: 'Administración' }] : []),
      ]
    : [
        { href: '/portal', texto: 'Mis tickets' },
        { href: '/kb', texto: 'Ayuda' },
      ]

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-marca text-sm text-white">?</span>
            {APP_NOMBRE}
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {enlaces.map((e) => (
              <Link key={e.href} href={e.href} className="text-black/65 hover:text-tinta">
                {e.texto}
              </Link>
            ))}
          </nav>
          <Link href="/portal/nuevo" className="btn">
            Nuevo ticket
          </Link>
          <form action="/auth/salir" method="post" className="flex items-center gap-3 text-sm">
            <span className="hidden text-black/55 sm:inline">{perfil.nombre || perfil.email}</span>
            <button className="text-black/55 underline-offset-2 hover:text-tinta hover:underline">Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
