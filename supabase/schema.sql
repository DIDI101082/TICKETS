-- ============================================================
-- Mesa de Ayuda — esquema completo
-- Pegar entero en Supabase > SQL Editor y ejecutar. Se puede correr más de una vez.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tablas ----------

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null default '',
  rol text not null default 'usuario' check (rol in ('admin','agente','usuario')),
  tipo text not null default 'externo' check (tipo in ('interno','externo')),
  organizacion text not null default '',
  creado_en timestamptz not null default now()
);

create table if not exists sectores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text not null default '',
  activo boolean not null default true,
  orden int not null default 0
);

create table if not exists agente_sectores (
  perfil_id uuid not null references perfiles(id) on delete cascade,
  sector_id uuid not null references sectores(id) on delete cascade,
  primary key (perfil_id, sector_id)
);

create table if not exists sla_politicas (
  prioridad text primary key check (prioridad in ('baja','media','alta','urgente')),
  minutos_respuesta int not null,
  minutos_resolucion int not null
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity (start with 1000),
  asunto text not null,
  descripcion text not null default '',
  estado text not null default 'abierto' check (estado in ('abierto','en_curso','en_espera','resuelto','cerrado')),
  prioridad text not null default 'media' references sla_politicas(prioridad),
  canal text not null default 'portal' check (canal in ('portal','email','teams')),
  sector_id uuid references sectores(id) on delete set null,
  solicitante_id uuid references perfiles(id) on delete set null,
  solicitante_email text not null default '',
  solicitante_nombre text not null default '',
  asignado_id uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  vence_respuesta timestamptz,
  vence_resolucion timestamptz,
  primera_respuesta_en timestamptz,
  resuelto_en timestamptz,
  en_espera_desde timestamptz,
  segundos_pausa int not null default 0,
  ia_sector text,
  ia_confianza numeric,
  ia_motivo text,
  alerta_respuesta boolean not null default false,
  alerta_resolucion boolean not null default false
);
create unique index if not exists tickets_numero_idx on tickets(numero);
create index if not exists tickets_estado_idx on tickets(estado);
create index if not exists tickets_solicitante_idx on tickets(solicitante_id);
create index if not exists tickets_sector_idx on tickets(sector_id);

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text not null default '',
  de_staff boolean not null default false,
  interno boolean not null default false,
  cuerpo text not null,
  creado_en timestamptz not null default now()
);
create index if not exists mensajes_ticket_idx on mensajes(ticket_id, creado_en);

create table if not exists adjuntos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  mensaje_id uuid references mensajes(id) on delete cascade,
  nombre text not null,
  ruta text not null,
  tamano int not null default 0,
  tipo text not null default '',
  creado_en timestamptz not null default now()
);
create index if not exists adjuntos_ticket_idx on adjuntos(ticket_id);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  autor_nombre text not null default '',
  detalle text not null,
  creado_en timestamptz not null default now()
);
create index if not exists eventos_ticket_idx on eventos(ticket_id, creado_en);

create table if not exists articulos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null default 'General',
  contenido text not null default '',
  visibilidad text not null default 'todos' check (visibilidad in ('todos','internos','staff')),
  publicado boolean not null default false,
  autor_nombre text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------- Datos iniciales ----------

insert into sla_politicas (prioridad, minutos_respuesta, minutos_resolucion) values
  ('urgente', 30, 240),
  ('alta', 60, 480),
  ('media', 240, 1440),
  ('baja', 480, 4320)
on conflict (prioridad) do nothing;

-- La descripción de cada sector es lo que lee la IA para decidir a dónde derivar.
insert into sectores (nombre, descripcion, orden) values
  ('CAU', 'Centro de Atención al Usuario. Primer nivel de soporte: problemas con la PC o notebook, impresoras, correo, Office, contraseñas y desbloqueo de cuentas, instalación de programas, periféricos, dudas de uso.', 1),
  ('Infraestructura', 'Servidores, red, VPN, firewall, wifi, internet, backups, bases de datos, caídas de servicios o sistemas, permisos sobre carpetas compartidas, entornos y despliegues.', 2),
  ('RRHH', 'Recursos Humanos: altas y bajas de personal, licencias y vacaciones, recibos de sueldo, beneficios, certificados laborales, consultas sobre políticas internas.', 3),
  ('Administración', 'Facturación, pagos, cobranzas, proveedores, compras, órdenes de compra, rendición de gastos, contratos y consultas contables.', 4)
on conflict (nombre) do nothing;

-- ---------- Funciones de permisos ----------

create or replace function tk_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;

create or replace function tk_tipo() returns text
language sql stable security definer set search_path = public as $$
  select tipo from perfiles where id = auth.uid()
$$;

create or replace function tk_es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('admin','agente') from perfiles where id = auth.uid()), false)
$$;

-- ---------- Alta automática de perfil ----------
-- El primer usuario que se registra queda como administrador.
-- Los tickets que entraron por email se vinculan a la cuenta recién cuando el email está confirmado.

create or replace function tk_usuario_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, email, nombre, rol)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    case when not exists (select 1 from perfiles) then 'admin' else 'usuario' end
  )
  on conflict (id) do nothing;

  if new.email_confirmed_at is not null and new.email is not null then
    update tickets set solicitante_id = new.id
    where solicitante_id is null and lower(solicitante_email) = lower(new.email);
  end if;
  return new;
end $$;

drop trigger if exists tk_usuario_auth_trg on auth.users;
create trigger tk_usuario_auth_trg
  after insert or update of email_confirmed_at on auth.users
  for each row execute function tk_usuario_auth();

-- ---------- SLA: vencimientos y pausa en "en espera" ----------
-- El reloj corre 24x7. Mientras el ticket está "en espera" el vencimiento de resolución se corre.

create or replace function tk_ticket_antes() returns trigger
language plpgsql as $$
declare
  p sla_politicas;
  delta int;
begin
  if tg_op = 'INSERT' or new.prioridad is distinct from old.prioridad then
    select * into p from sla_politicas where prioridad = new.prioridad;
    if found then
      new.vence_respuesta := new.creado_en + make_interval(mins => p.minutos_respuesta);
      new.vence_resolucion := new.creado_en + make_interval(mins => p.minutos_resolucion)
                              + make_interval(secs => new.segundos_pausa);
      new.alerta_resolucion := false;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if old.estado = 'en_espera' and old.en_espera_desde is not null then
      delta := greatest(0, extract(epoch from (now() - old.en_espera_desde))::int);
      new.segundos_pausa := old.segundos_pausa + delta;
      new.vence_resolucion := new.vence_resolucion + make_interval(secs => delta);
      new.en_espera_desde := null;
    end if;
    if new.estado = 'en_espera' then
      new.en_espera_desde := now();
    end if;
    if new.estado in ('resuelto','cerrado') and new.resuelto_en is null then
      new.resuelto_en := now();
    end if;
    if new.estado in ('abierto','en_curso','en_espera') and old.estado in ('resuelto','cerrado') then
      new.resuelto_en := null;
      new.alerta_resolucion := false;
    end if;
  end if;

  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists tk_ticket_antes_trg on tickets;
create trigger tk_ticket_antes_trg
  before insert or update on tickets
  for each row execute function tk_ticket_antes();

-- Primera respuesta del equipo y reapertura cuando contesta el solicitante.
create or replace function tk_mensaje_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.de_staff and not new.interno then
    update tickets set primera_respuesta_en = coalesce(primera_respuesta_en, new.creado_en)
    where id = new.ticket_id;
  elsif not new.de_staff then
    update tickets set estado = case when estado in ('en_espera','resuelto') then 'en_curso' else estado end
    where id = new.ticket_id;
  else
    update tickets set actualizado_en = now() where id = new.ticket_id;
  end if;
  return new;
end $$;

drop trigger if exists tk_mensaje_despues_trg on mensajes;
create trigger tk_mensaje_despues_trg
  after insert on mensajes
  for each row execute function tk_mensaje_despues();

-- ---------- Seguridad por fila ----------
-- Las lecturas pasan por estas políticas. Las escrituras las hace el servidor de la app
-- (con la service role key) después de validar el rol, por eso no hay políticas de escritura.

alter table perfiles enable row level security;
alter table sectores enable row level security;
alter table agente_sectores enable row level security;
alter table sla_politicas enable row level security;
alter table tickets enable row level security;
alter table mensajes enable row level security;
alter table adjuntos enable row level security;
alter table eventos enable row level security;
alter table articulos enable row level security;

drop policy if exists perfiles_leer on perfiles;
create policy perfiles_leer on perfiles for select to authenticated
  using (id = auth.uid() or tk_es_staff());

drop policy if exists sectores_leer on sectores;
create policy sectores_leer on sectores for select to authenticated using (true);

drop policy if exists agente_sectores_leer on agente_sectores;
create policy agente_sectores_leer on agente_sectores for select to authenticated using (tk_es_staff());

drop policy if exists sla_leer on sla_politicas;
create policy sla_leer on sla_politicas for select to authenticated using (true);

drop policy if exists tickets_leer on tickets;
create policy tickets_leer on tickets for select to authenticated
  using (solicitante_id = auth.uid() or tk_es_staff());

drop policy if exists mensajes_leer on mensajes;
create policy mensajes_leer on mensajes for select to authenticated
  using (
    tk_es_staff()
    or (not interno and exists (select 1 from tickets t where t.id = ticket_id and t.solicitante_id = auth.uid()))
  );

drop policy if exists adjuntos_leer on adjuntos;
create policy adjuntos_leer on adjuntos for select to authenticated
  using (
    tk_es_staff()
    or (
      exists (select 1 from tickets t where t.id = ticket_id and t.solicitante_id = auth.uid())
      and (mensaje_id is null or exists (select 1 from mensajes m where m.id = mensaje_id and not m.interno))
    )
  );

drop policy if exists eventos_leer on eventos;
create policy eventos_leer on eventos for select to authenticated using (tk_es_staff());

drop policy if exists articulos_leer on articulos;
create policy articulos_leer on articulos for select to authenticated
  using (
    tk_es_staff()
    or (publicado and (visibilidad = 'todos' or (visibilidad = 'internos' and tk_tipo() = 'interno')))
  );

-- ---------- Almacenamiento de adjuntos (privado) ----------
insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;
