import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Cliente con la sesión del usuario: respeta las políticas de seguridad por fila. */
export async function crearCliente() {
  const almacen = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: el middleware se ocupa de refrescar la sesión.
          }
        },
      },
    },
  )
}
