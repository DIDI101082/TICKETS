import { sesion } from '@/lib/auth'
import { fecha } from '@/lib/formato'
import type { Servicio } from '@/lib/tipos'
import { eliminarServicio, guardarServicio } from '../acciones'

const ESTADO: Record<string, { texto: string; punto: string; clase: string }> = {
  operativo: { texto: 'Funciona normalmente', punto: 'bg-emerald-500', clase: 'text-emerald-700' },
  degradado: { texto: 'Funciona con problemas', punto: 'bg-amber-500', clase: 'text-amber-700' },
  caido: { texto: 'Fuera de servicio', punto: 'bg-red-500', clase: 'text-red-700' },
}

export default async function Estado() {
  const { db, staff } = await sesion()
  const { data } = await db.from('servicios').select('*').order('orden').order('nombre')
  const servicios = (data ?? []) as Servicio[]
  const conProblemas = servicios.filter((s) => s.estado !== 'operativo')

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1>Estado de los servicios</h1>
        <p className="text-sm text-ink/60">
          {conProblemas.length === 0
            ? 'Todos los servicios funcionan normalmente.'
            : 'Ya estamos trabajando en los problemas marcados. No hace falta cargar un ticket por ellos.'}
        </p>
      </div>

      <div className="tarjeta divide-y divide-line/[0.06]">
        {servicios.map((s) => {
          const e = ESTADO[s.estado]
          return (
            <div key={s.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{s.nombre}</p>
                <p className={`flex items-center gap-2 text-sm font-medium ${e.clase}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${e.punto}`} aria-hidden />
                  {e.texto}
                </p>
              </div>
              {s.estado !== 'operativo' && (
                <p className="mt-1 text-sm text-ink/65">
                  {s.mensaje || 'Estamos investigando.'} <span className="text-ink/45">· actualizado {fecha(s.actualizado_en)}</span>
                </p>
              )}
              {staff && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-ink/50">Cambiar estado</summary>
                  <form action={guardarServicio.bind(null, s.id)} className="mt-2 grid gap-2 sm:grid-cols-[1fr_12rem_5rem]">
                    <input name="nombre" required defaultValue={s.nombre} className="campo" aria-label="Nombre" />
                    <select name="estado" defaultValue={s.estado} className="campo" aria-label="Estado">
                      <option value="operativo">Funciona normalmente</option>
                      <option value="degradado">Con problemas</option>
                      <option value="caido">Fuera de servicio</option>
                    </select>
                    <input name="orden" type="number" defaultValue={s.orden} className="campo" aria-label="Orden" />
                    <input name="mensaje" defaultValue={s.mensaje} placeholder="Qué pasa y cuándo se estima que vuelve" className="campo sm:col-span-3" />
                    <div className="flex items-center gap-4 sm:col-span-3">
                      <button className="btn-sec">Guardar</button>
                      <button formAction={eliminarServicio.bind(null, s.id)} className="text-xs text-ink/50 hover:text-red-700">Eliminar servicio</button>
                    </div>
                  </form>
                </details>
              )}
            </div>
          )
        })}
        {servicios.length === 0 && <p className="p-6 text-center text-sm text-ink/60">No hay servicios cargados.</p>}
      </div>

      {staff && (
        <form action={guardarServicio.bind(null, null)} className="grid gap-2 rounded-xl border border-dashed border-line/20 p-4 sm:grid-cols-[1fr_auto]">
          <input name="nombre" required placeholder="Agregar un servicio" className="campo" />
          <input type="hidden" name="orden" value={servicios.length + 1} />
          <button className="btn">Agregar</button>
        </form>
      )}
    </div>
  )
}
