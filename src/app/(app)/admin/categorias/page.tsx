import { exigirAdmin } from '@/lib/auth'
import { PRIORIDADES, type Campo, type Categoria, type Sector } from '@/lib/tipos'
import { guardarCategoria } from '../acciones'
import { TIPOS_DIAGNOSTICO } from '@/lib/diagnostico'

const aTexto = (campos: Campo[]) =>
  (campos ?? []).map((c) => [c.etiqueta, c.tipo, c.opciones.join(', '), c.requerido ? 'obligatorio' : ''].join(' | ').replace(/(\s\|\s)+$/, '')).join('\n')

function Formulario({ c, sectores, orden, mailDe }: { c?: Categoria; sectores: Sector[]; orden: number; mailDe: Map<string, string> }) {
  return (
    <form action={guardarCategoria.bind(null, c?.id ?? null)} className={`space-y-3 p-4 ${c ? 'tarjeta' : 'rounded-xl border border-dashed border-line/20'}`}>
      {!c && <h2>Nueva categoría</h2>}
      <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
        <div>
          <label className="rotulo">Nombre</label>
          <input name="nombre" required defaultValue={c?.nombre} className="campo" />
        </div>
        <div>
          <label className="rotulo">Ayuda para quien carga el ticket</label>
          <input name="descripcion" defaultValue={c?.descripcion} className="campo" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="rotulo">Sector</label>
          <select name="sector_id" defaultValue={c?.sector_id ?? ''} className="campo">
            <option value="">Que lo decida la IA</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Prioridad</label>
          <select name="prioridad" defaultValue={c?.prioridad ?? ''} className="campo">
            <option value="">Que la decida la IA</option>
            {PRIORIDADES.map((p) => (
              <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Orden</label>
          <input name="orden" type="number" defaultValue={c?.orden ?? orden} className="campo" />
        </div>
      </div>
      <div>
        <label className="rotulo">Campos del formulario</label>
        <textarea name="campos" rows={4} defaultValue={c ? aTexto(c.campos) : ''} className="campo font-mono text-[13px]" placeholder={'Sistema o servicio | texto | | obligatorio\n¿A cuántos afecta? | lista | Solo a mí, A mi equipo | obligatorio\nHasta cuándo | fecha\nDetalle | párrafo'} />
        <p className="mt-1 text-xs text-ink/45">Un campo por línea: Etiqueta | tipo (texto, párrafo, lista o fecha) | opciones separadas por coma | obligatorio</p>
      </div>
      <div>
        <label className="rotulo">Checklist (una tarea por línea)</label>
        <textarea name="tareas" rows={3} defaultValue={(c?.tareas ?? []).join('\n')} className="campo text-[13px]" placeholder={'Deshabilitar la cuenta\n[Ciberseguridad] Quitar accesos a VPN y AWS\nRecuperar el equipo'} />
        <p className="mt-1 text-xs text-ink/45">Se copian a cada ticket nuevo de esta categoría y no se puede resolver hasta completarlas (o marcarlas como “no aplica”). Entre corchetes, el sector que la hace.</p>
      </div>
      <div>
        <label className="rotulo">Revisar antes de enviar</label>
        <select name="diagnostico" defaultValue={c?.diagnostico ?? ''} className="campo">
          <option value="">No revisar</option>
          {TIPOS_DIAGNOSTICO.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
        </select>
        <p className="mt-1 text-xs text-ink/45">Con los datos de Accusys Cyber, se le muestra a la persona lo que encontramos en su equipo o su cuenta y cómo resolverlo, antes de enviar el pedido.</p>
      </div>
      <div>
        <label className="rotulo">Consejos para quien pide</label>
        <textarea name="consejos" rows={2} defaultValue={c?.consejos ?? ''} className="campo text-[13px]" placeholder="Ej.: Antes de viajar, actualizá la notebook y no te conectes a redes Wi-Fi abiertas sin la VPN." />
        <p className="mt-1 text-xs text-ink/45">Se muestran al elegir la categoría y en el pedido, mientras está abierto. Admite **negrita**, listas con guion y [enlaces](https://…).</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="rotulo">Quién aprueba (mails, en orden)</label>
          <input name="aprobadores" defaultValue={(c?.aprobadores ?? []).map((id) => mailDe.get(id)).filter(Boolean).join(', ')} placeholder="jefe@empresa.com, seguridad@empresa.com" className="campo" />
          <p className="mt-1 text-xs text-ink/45">Si hay más de uno, aprueban de a uno y en ese orden. Vacío: lo designa el agente en cada ticket.</p>
        </div>
        <label className="flex items-center gap-1.5 pb-6 text-sm">
          <input type="checkbox" name="aprobador_jefe" defaultChecked={c?.aprobador_jefe} className="accent-brand-600" /> Primero, el jefe de quien lo pide
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="requiere_aprobacion" defaultChecked={c?.requiere_aprobacion} className="accent-brand-600" /> Requiere aprobación
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="confidencial" defaultChecked={c?.confidencial} className="accent-brand-600" /> Confidencial
        </label>
        <label className="flex items-center gap-1.5" title="Al resolverse, el acceso queda registrado y se controla su vencimiento">
          <input type="checkbox" name="es_acceso" defaultChecked={c?.es_acceso} className="accent-brand-600" /> Otorga un acceso
        </label>
        <label className="flex items-center gap-1.5" title="Cómo se llama el acceso en el registro. Vacío: el nombre de la categoría">
          Nombre del acceso
          <input name="acceso_nombre" defaultValue={c?.acceso_nombre ?? ''} className="campo w-48 py-1" placeholder="Ej.: VPN fuera de horario" />
        </label>
        <label className="flex items-center gap-1.5" title="Se usa si el pedido no trae una fecha de fin válida. Vacío: sin límite">
          Vence a los
          <input name="acceso_dias_max" type="number" min={1} max={3650} defaultValue={c?.acceso_dias_max ?? ''} className="campo w-20 py-1" aria-label="Días hasta el vencimiento si no hay fecha" />
          días
        </label>
        <label className="flex items-center gap-1.5" title="Para accesos sin fecha de fin: cada cuántos días se pregunta si siguen haciendo falta">
          Reconfirmar cada
          <input name="recertificar_dias" type="number" min={7} max={730} defaultValue={c?.recertificar_dias ?? 90} className="campo w-20 py-1" aria-label="Días entre reconfirmaciones" />
          días
        </label>
        {c && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="activo" defaultChecked={c.activo} className="accent-brand-600" /> Activa
          </label>
        )}
        <button className={c ? 'btn-sec' : 'btn'}>{c ? 'Guardar' : 'Agregar categoría'}</button>
      </div>
    </form>
  )
}

export default async function Categorias() {
  const { db } = await exigirAdmin()
  const [rc, rs] = await Promise.all([db.from('categorias').select('*').order('orden').order('nombre'), db.from('sectores').select('*').eq('activo', true).order('orden')])
  const categorias = (rc.data ?? []) as Categoria[]
  const sectores = (rs.data ?? []) as Sector[]
  const ids = [...new Set(categorias.flatMap((c) => c.aprobadores ?? []))]
  const { data: gente } = ids.length ? await db.from('perfiles').select('id,email').in('id', ids) : { data: [] }
  const mailDe = new Map((gente ?? []).map((g) => [g.id as string, g.email as string]))
  return (
    <div className="space-y-5">
      <div>
        <h1>Categorías y formularios</h1>
        <p className="text-sm text-ink/60">
          Los tipos de pedido que elige la persona al cargar un ticket. Cada uno puede pedir datos propios, ir directo a un sector, exigir aprobación o ser confidencial.
        </p>
      </div>
      {categorias.map((c) => (
        <Formulario key={c.id} c={c} sectores={sectores} orden={c.orden} mailDe={mailDe} />
      ))}
      <Formulario sectores={sectores} orden={categorias.length + 1} mailDe={mailDe} />
    </div>
  )
}
