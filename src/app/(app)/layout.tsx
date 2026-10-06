import { sesion } from '@/lib/auth'
import Nav, { type Aviso } from '@/components/Nav'

export default async function Marco({ children }: { children: React.ReactNode }) {
  const { db, perfil } = await sesion()
  const [lista, sinLeer] = await Promise.all([
    db.from('notificaciones').select('id,ticket_id,texto,leida,creado_en').order('creado_en', { ascending: false }).limit(10),
    db.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false),
  ])
  return (
    <div className="min-h-screen">
      <Nav nombre={perfil.nombre} email={perfil.email} rol={perfil.rol} avisos={(lista.data ?? []) as Aviso[]} sinLeer={sinLeer.count ?? 0} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
