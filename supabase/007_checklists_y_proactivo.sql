-- ============================================================
-- 007 — Checklists por tipo de pedido
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 006_accesos_y_conocimiento.sql
-- y ANTES de subir el código nuevo. Se puede correr más de una vez.
-- ============================================================

-- Tareas de cada categoría: lista de textos. Un texto que empieza con [Sector] indica quién la hace.
alter table categorias add column if not exists tareas jsonb not null default '[]';

create table if not exists ticket_tareas (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  orden int not null default 0,
  texto text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'no_aplica')),
  hecha_por text not null default '',
  hecha_en timestamptz,
  nota text not null default ''
);
create index if not exists ticket_tareas_ticket_idx on ticket_tareas(ticket_id, orden);

-- Al crear un ticket con categoría, se copian sus tareas (vale para todos los canales: portal, mail, Teams, en lote).
create or replace function tk_ticket_tareas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.categoria_id is not null then
    insert into ticket_tareas (ticket_id, orden, texto)
    select new.id, x.o, left(trim(x.t), 300)
      from categorias c, jsonb_array_elements_text(c.tareas) with ordinality as x(t, o)
     where c.id = new.categoria_id and trim(x.t) <> '';
  end if;
  return new;
end $$;
drop trigger if exists tk_ticket_tareas_trg on tickets;
create trigger tk_ticket_tareas_trg after insert on tickets
  for each row execute function tk_ticket_tareas();

-- No se puede resolver ni cerrar un ticket con tareas pendientes (salvo al fusionarlo en otro).
create or replace function tk_ticket_tareas_cierre() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.estado in ('resuelto', 'cerrado') and old.estado not in ('resuelto', 'cerrado') and new.fusionado_en_id is null then
    select count(*) into n from ticket_tareas where ticket_id = new.id and estado = 'pendiente';
    if n > 0 then
      raise exception 'TAREAS_PENDIENTES: el ticket #% tiene % tarea(s) del checklist sin completar', new.numero, n;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tk_ticket_tareas_cierre_trg on tickets;
create trigger tk_ticket_tareas_cierre_trg before update of estado on tickets
  for each row execute function tk_ticket_tareas_cierre();

-- Checklists iniciales (solo si la categoría todavía no tiene)
update categorias set tareas = '[
  "Crear la cuenta en Entra ID / Active Directory",
  "Asignar licencias de Microsoft 365",
  "Registrar el MFA de la persona",
  "Agregar a los grupos de correo y de Teams",
  "Preparar el equipo y registrarlo en Accusys Cyber",
  "[Ciberseguridad] Verificar antivirus, cifrado y agente en el equipo",
  "Otorgar los accesos pedidos en el formulario",
  "Entregar el equipo y las credenciales"
]'::jsonb where nombre = 'Alta de usuario' and tareas = '[]'::jsonb;

update categorias set tareas = '[
  "Deshabilitar la cuenta en Entra ID / Active Directory",
  "[Ciberseguridad] Cerrar sesiones activas y quitar los métodos de MFA",
  "Convertir o reenviar el correo según el formulario",
  "Transferir OneDrive y carpetas compartidas",
  "Quitar las licencias de Microsoft 365",
  "[Ciberseguridad] Quitar accesos a VPN, AWS, Azure DevOps, Sentry y otros sistemas",
  "Recuperar los equipos y actualizar Accusys Cyber",
  "Quitar de los grupos de correo y de Teams"
]'::jsonb where nombre = 'Baja de usuario' and tareas = '[]'::jsonb;

update categorias set tareas = '[
  "Quitar los accesos del área anterior",
  "Otorgar los accesos del área nueva",
  "Actualizar grupos de correo y de Teams",
  "Actualizar área y jefe en Entra ID y en Accusys Cyber",
  "Cambiar equipo u oficina si corresponde"
]'::jsonb where nombre = 'Cambio de área' and tareas = '[]'::jsonb;

update categorias set tareas = '[
  "Crear el servidor (VM o instancia) con los recursos pedidos",
  "Instalar el sistema operativo y aplicar el hardening",
  "[Ciberseguridad] Instalar ESET y el agente de Accusys Cyber",
  "Configurar backup en Veeam",
  "Dar de alta en el monitoreo (PRTG)",
  "Abrir los puertos pedidos en el firewall",
  "Otorgar los accesos pedidos",
  "Registrar el servidor en Accusys Cyber"
]'::jsonb where nombre = 'Armado de servidor' and tareas = '[]'::jsonb;

-- ---------- Seguridad por fila ----------
alter table ticket_tareas enable row level security;
drop policy if exists ticket_tareas_leer on ticket_tareas;
create policy ticket_tareas_leer on ticket_tareas for select to authenticated using (tk_ve_ticket(ticket_id));

-- Soporte proactivo: configuración inicial (apagado hasta que un administrador lo active)
insert into config (clave, valor) values ('proactivo', '{"activo": false}') on conflict (clave) do nothing;
