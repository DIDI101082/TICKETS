import { sesion } from '@/lib/auth'
import Nav from '@/components/Nav'

export default async function Marco({ children }: { children: React.ReactNode }) {
  const { perfil } = await sesion()
  return (
    <div className="min-h-screen">
      <Nav nombre={perfil.nombre} email={perfil.email} rol={perfil.rol} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
