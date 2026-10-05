import { exigirStaff } from '@/lib/auth'
import { eliminarPlantilla, guardarPlantilla } from '../admin/acciones'

export default async function Plantillas() {
  const { db } = await exigirStaff()
  const { data } = await db.from('plantillas').select('*').order('titulo')
  const lista = (data ?? []) as { id: string; titulo: string; cuerpo: string }[]
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1>Respuestas predefinidas</h1>
        <p className="text-sm text-ink/60">
          Textos que se insertan al responder un ticket. Podés usar {'{{nombre}}'}, {'{{numero}}'} y {'{{asunto}}'}: se reemplazan con los datos del ticket.
        </p>
      </div>
      {lista.map((p) => (
        <div key={p.id} className="space-y-1">
          <form action={guardarPlantilla.bind(null, p.id)} className="tarjeta space-y-3 p-4">
            <input name="titulo" required defaultValue={p.titulo} className="campo font-medium" aria-label="Título" />
            <textarea name="cuerpo" required rows={4} defaultValue={p.cuerpo} className="campo" aria-label="Texto" />
            <button className="btn-sec">Guardar</button>
          </form>
          <form action={eliminarPlantilla.bind(null, p.id)} className="text-right">
            <button className="text-xs text-ink/50 hover:text-red-700">Eliminar</button>
          </form>
        </div>
      ))}
      <form action={guardarPlantilla.bind(null, null)} className="space-y-3 rounded-xl border border-dashed border-line/20 p-4">
        <h2>Nueva respuesta</h2>
        <input name="titulo" required placeholder="Título (lo ve solo el equipo)" className="campo" />
        <textarea name="cuerpo" required rows={4} placeholder="Hola {{nombre}}, …" className="campo" />
        <button className="btn">Agregar</button>
      </form>
    </div>
  )
}
