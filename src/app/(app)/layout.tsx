import { sesion } from '@/lib/auth'
import { leerMantenimiento } from '@/lib/config'
import Nav, { type Aviso } from '@/components/Nav'
import { alternarVista } from './acciones'

export default async function Marco({ children }: { children: React.ReactNode }) {
  const { db, perfil, staff, supervisor, vistaPrevia } = await sesion()
  const [lista, sinLeer, mant] = await Promise.all([
    db.from('notificaciones').select('id,ticket_id,texto,leida,creado_en').order('creado_en', { ascending: false }).limit(10),
    db.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false),
    staff ? leerMantenimiento() : Promise.resolve(null),
  ])
  return (
    <div className="min-h-screen">
      {vistaPrevia && (
        <form action={alternarVista} className="flex flex-wrap items-center justify-center gap-3 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 print:hidden">
          Estás viendo la app como la ve un usuario.
          <button className="font-medium underline">Volver a mi vista</button>
        </form>
      )}
      <Nav
        nombre={perfil.nombre}
        email={perfil.email}
        rol={vistaPrevia ? 'usuario' : perfil.rol}
        rolReal={perfil.rol}
        verTablero={supervisor || !mant?.tablero_solo_supervisores}
        avisos={(lista.data ?? []) as Aviso[]}
        sinLeer={sinLeer.count ?? 0}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
