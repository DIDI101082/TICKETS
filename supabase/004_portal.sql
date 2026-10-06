-- ============================================================
-- Mesa de Ayuda — ampliación 004: mejoras para el usuario
-- Ejecutar después de schema.sql y 002_ampliacion.sql. Se puede correr más de una vez.
-- Suma: notificaciones, preferencias de aviso, pedidos en nombre de otro, personas en copia,
-- impacto y urgencia, votos de artículos, estado de servicios y aprobación desde el mail.
-- ============================================================

alter table perfiles add column if not exists avisos_mail text not null default 'todo';
alter table perfiles drop constraint if exists perfiles_avisos_check;
alter table perfiles add constraint perfiles_avisos_check check (avisos_mail in ('todo','resuelto','nada'));

alter table tickets add column if not exists impacto text not null default '';
alter table tickets add column if not exists urgencia text not null default '';
alter table tickets add column if not exists beneficiario_id uuid references perfiles(id) on delete set null;
alter table tickets add column if not exists beneficiario_nombre text not null default '';
alter table tickets add column if not exists aprobacion_token text;
create index if not exists tickets_beneficiario_idx on tickets(beneficiario_id);
create unique index if not exists tickets_token_idx on tickets(aprobacion_token) where aprobacion_token is not null;

create table if not exists ticket_seguidores (
  ticket_id uuid not null references tickets(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  primary key (ticket_id, perfil_id)
);

create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete cascade,
  texto text not null,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);
create index if not exists notificaciones_perfil_idx on notificaciones(perfil_id, leida, creado_en desc);

create table if not exists articulo_votos (
  articulo_id uuid not null references articulos(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  util boolean not null,
  primary key (articulo_id, perfil_id)
);

create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  estado text not null default 'operativo' check (estado in ('operativo','degradado','caido')),
  mensaje text not null default '',
  orden int not null default 0,
  actualizado_en timestamptz not null default now()
);

insert into servicios (nombre, orden) values
  ('Correo y Teams', 1),
  ('VPN', 2),
  ('Internet y red de oficina', 3),
  ('Plataforma Core', 4),
  ('Servicios en la nube (AWS)', 5)
on conflict (nombre) do nothing;

-- ---------- Quién puede ver cada ticket (suma beneficiario y personas en copia) ----------

create or replace function tk_ve_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from tickets t
    join perfiles yo on yo.id = auth.uid()
    where t.id = p_ticket and (
      t.solicitante_id = yo.id
      or t.beneficiario_id = yo.id
      or t.aprobador_id = yo.id
      or exists (select 1 from ticket_seguidores sg where sg.ticket_id = t.id and sg.perfil_id = yo.id)
      or yo.rol = 'admin'
      or (yo.rol = 'agente' and (
            t.asignado_id = yo.id
            or exists (select 1 from ticket_acceso a where a.ticket_id = t.id and a.perfil_id = yo.id)
            or (not t.confidencial and (
                  not coalesce((select (valor->>'restringir_sector')::boolean from config where clave = 'opciones'), false)
                  or t.sector_id is null
                  or exists (select 1 from agente_sectores s where s.perfil_id = yo.id and s.sector_id = t.sector_id)
            ))
      ))
      or (yo.rol = 'usuario' and yo.ve_organizacion and yo.organizacion_id is not null
          and t.organizacion_id = yo.organizacion_id and not t.confidencial)
    )
  )
$$;

-- ---------- Seguridad por fila ----------

alter table ticket_seguidores enable row level security;
alter table notificaciones enable row level security;
alter table articulo_votos enable row level security;
alter table servicios enable row level security;

drop policy if exists seguidores_leer on ticket_seguidores;
create policy seguidores_leer on ticket_seguidores for select to authenticated using (tk_ve_ticket(ticket_id));

drop policy if exists notificaciones_leer on notificaciones;
create policy notificaciones_leer on notificaciones for select to authenticated using (perfil_id = auth.uid());

drop policy if exists votos_leer on articulo_votos;
create policy votos_leer on articulo_votos for select to authenticated using (perfil_id = auth.uid() or tk_es_staff());

drop policy if exists servicios_leer on servicios;
create policy servicios_leer on servicios for select to authenticated using (true);
