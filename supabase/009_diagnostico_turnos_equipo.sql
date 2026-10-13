-- ============================================================
-- 009 — Diagnóstico antes de cargar un pedido, turnos con el CAU y "Mi equipo" para jefes
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 008_phishing_politicas_viajes.sql
-- y ANTES de subir el código nuevo. Se puede correr más de una vez.
-- ============================================================

-- ---------- Diagnóstico ("Arreglalo vos") ----------
-- Qué revisa Desk con los datos de Accusys Cyber antes de enviar un pedido de esa categoría.
alter table categorias add column if not exists diagnostico text;
alter table categorias drop constraint if exists categorias_diagnostico_check;
alter table categorias add constraint categorias_diagnostico_check check (diagnostico is null or diagnostico in ('equipo', 'vpn', 'cuenta'));
update categorias set diagnostico = 'equipo' where nombre = 'Falla de equipo' and diagnostico is null;
update categorias set diagnostico = 'cuenta' where nombre = 'Acceso o contraseña' and diagnostico is null;
update categorias set diagnostico = 'vpn' where nombre = 'Red, VPN o servidores' and diagnostico is null;

-- Cada diagnóstico mostrado queda registrado: sirve para medir cuántos pedidos se resolvieron sin ticket.
create table if not exists autoservicio (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfiles(id) on delete set null,
  categoria_id uuid references categorias(id) on delete set null,
  tipo text not null,
  hallazgos jsonb not null default '[]',
  resultado text not null default 'mostrado' check (resultado in ('mostrado', 'resuelto', 'ticket')),
  ticket_id uuid references tickets(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists autoservicio_creado_idx on autoservicio(creado_en desc);
alter table autoservicio enable row level security;
drop policy if exists autoservicio_leer on autoservicio;
create policy autoservicio_leer on autoservicio for select to authenticated using (tk_es_staff());

-- ---------- Turnos con el CAU ----------
create table if not exists turno_lugares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  modalidad text not null default 'presencial' check (modalidad in ('presencial', 'remoto')),
  indicaciones text not null default '',              -- dónde es o cómo se conecta (se manda en la confirmación)
  dias int[] not null default '{1,2,3,4,5}',           -- 0 = domingo … 6 = sábado
  desde time not null default '10:00',
  hasta time not null default '17:00',
  duracion_min int not null default 30 check (duracion_min between 10 and 240),
  capacidad int not null default 1 check (capacidad between 1 and 20),   -- turnos simultáneos (técnicos disponibles)
  anticipacion_horas int not null default 2 check (anticipacion_horas between 0 and 168),
  sector_id uuid references sectores(id) on delete set null,
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

-- Días sin atención (feriados, vacaciones del equipo, mudanzas). Sin lugar = todos los lugares.
create table if not exists turno_bloqueos (
  id uuid primary key default gen_random_uuid(),
  lugar_id uuid references turno_lugares(id) on delete cascade,
  desde date not null,
  hasta date not null,
  motivo text not null default '',
  check (hasta >= desde)
);

create table if not exists turnos (
  id uuid primary key default gen_random_uuid(),
  lugar_id uuid not null references turno_lugares(id) on delete restrict,
  inicio timestamptz not null,
  fin timestamptz not null,
  perfil_id uuid references perfiles(id) on delete cascade,
  persona_nombre text not null default '',
  persona_email text not null default '',
  motivo text not null,
  detalle text not null default '',
  equipo text not null default '',
  ticket_id uuid references tickets(id) on delete set null,
  estado text not null default 'reservado' check (estado in ('reservado', 'cancelado', 'atendido', 'ausente')),
  tecnico_id uuid references perfiles(id) on delete set null,
  nota_tecnico text not null default '',
  recordado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (fin > inicio)
);
create index if not exists turnos_lugar_inicio_idx on turnos(lugar_id, inicio) where estado = 'reservado';
create index if not exists turnos_perfil_idx on turnos(perfil_id, inicio desc);

-- Cupo y superposición se controlan en la base: dos personas que reservan a la vez no pueden pasarse del cupo.
create or replace function tk_turno_control() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cap int; v_ocupados int;
begin
  new.actualizado_en := now();
  if new.estado <> 'reservado' then return new; end if;
  if tg_op = 'UPDATE' and old.estado = 'reservado' and old.inicio = new.inicio and old.lugar_id = new.lugar_id then return new; end if;
  select capacidad into v_cap from turno_lugares where id = new.lugar_id for update;
  select count(*) into v_ocupados from turnos t
   where t.lugar_id = new.lugar_id and t.estado = 'reservado' and t.id <> new.id
     and t.inicio < new.fin and t.fin > new.inicio;
  if v_ocupados >= coalesce(v_cap, 1) then raise exception 'TURNO_OCUPADO'; end if;
  if new.perfil_id is not null then
    if exists (select 1 from turnos t where t.perfil_id = new.perfil_id and t.estado = 'reservado' and t.id <> new.id
                and t.inicio < new.fin and t.fin > new.inicio) then
      raise exception 'TURNO_SUPERPUESTO';
    end if;
    if (select count(*) from turnos t where t.perfil_id = new.perfil_id and t.estado = 'reservado' and t.id <> new.id and t.inicio > now()) >= 3 then
      raise exception 'TURNO_LIMITE';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tk_turno_control on turnos;
create trigger tk_turno_control before insert or update on turnos for each row execute function tk_turno_control();

alter table turno_lugares enable row level security;
alter table turno_bloqueos enable row level security;
alter table turnos enable row level security;
drop policy if exists turno_lugares_leer on turno_lugares;
create policy turno_lugares_leer on turno_lugares for select to authenticated using (activo or tk_es_staff());
drop policy if exists turno_bloqueos_leer on turno_bloqueos;
create policy turno_bloqueos_leer on turno_bloqueos for select to authenticated using (true);
drop policy if exists turnos_leer on turnos;
create policy turnos_leer on turnos for select to authenticated using (perfil_id = auth.uid() or tk_es_staff());
-- Las altas, cancelaciones y cambios se hacen desde el servidor (con los controles de cada acción).

-- Lugares iniciales: se ajustan en Administración → Turnos.
insert into turno_lugares (nombre, modalidad, indicaciones, sector_id, orden) values
  ('CAU · Piso 4', 'presencial', 'Mesa del CAU en el piso 4. Traé el equipo con el cargador.', (select id from sectores where nombre = 'CAU'), 1),
  ('CAU · Piso 5', 'presencial', 'Mesa del CAU en el piso 5. Traé el equipo con el cargador.', (select id from sectores where nombre = 'CAU'), 2),
  ('CAU · Piso 7', 'presencial', 'Mesa del CAU en el piso 7. Traé el equipo con el cargador.', (select id from sectores where nombre = 'CAU'), 3),
  ('CAU · Córdoba', 'presencial', 'Oficina de Córdoba.', (select id from sectores where nombre = 'CAU'), 4),
  ('Remoto (Teams)', 'remoto', 'Te llamamos por Teams a la hora del turno. Tené el equipo prendido y conectado.', (select id from sectores where nombre = 'CAU'), 5)
on conflict (nombre) do nothing;

-- ---------- Mi equipo ----------
create index if not exists perfiles_jefe_idx on perfiles(jefe_id) where jefe_id is not null;
