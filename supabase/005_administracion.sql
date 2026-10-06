-- ============================================================
-- Mesa de Ayuda — ampliación 005: herramientas para agentes y administradores
-- Ejecutar después de 002_ampliacion.sql y 004_portal.sql. Se puede correr más de una vez.
-- ============================================================

-- ---------- Personas ----------
alter table perfiles add column if not exists activo boolean not null default true;
alter table perfiles add column if not exists supervisor boolean not null default false;
alter table perfiles add column if not exists ausente_hasta date;
alter table perfiles add column if not exists jefe_id uuid references perfiles(id) on delete set null;

-- ---------- Sectores: reparto automático ----------
alter table sectores add column if not exists asignacion text not null default 'manual';
alter table sectores drop constraint if exists sectores_asignacion_check;
alter table sectores add constraint sectores_asignacion_check check (asignacion in ('manual','turno','carga'));
alter table sectores add column if not exists ultimo_asignado uuid;

-- ---------- Categorías: aprobadores por defecto, en orden ----------
alter table categorias add column if not exists aprobadores uuid[] not null default '{}';
alter table categorias add column if not exists aprobador_jefe boolean not null default false;

-- ---------- Plantillas como macros ----------
alter table plantillas add column if not exists estado_tras text not null default '';
alter table plantillas add column if not exists nota_interna boolean not null default false;

-- ---------- Tickets ----------
alter table tickets add column if not exists eliminado_en timestamptz;
alter table tickets add column if not exists eliminado_por text not null default '';
alter table tickets add column if not exists minutos_trabajados int not null default 0;
alter table tickets add column if not exists aprobadores_pendientes uuid[] not null default '{}';
alter table tickets add column if not exists recordatorio_en timestamptz;

alter table tickets drop constraint if exists tickets_canal_check;
alter table tickets add constraint tickets_canal_check check (canal in ('portal','email','teams','monitoreo','programado','telefono','importado'));

-- ---------- Tablas nuevas ----------
create table if not exists tiempos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  perfil_id uuid references perfiles(id) on delete set null,
  autor_nombre text not null default '',
  minutos int not null check (minutos > 0),
  nota text not null default '',
  creado_en timestamptz not null default now()
);
create index if not exists tiempos_ticket_idx on tiempos(ticket_id);

create table if not exists presencia (
  ticket_id uuid not null references tickets(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  nombre text not null default '',
  escribiendo boolean not null default false,
  visto_en timestamptz not null default now(),
  primary key (ticket_id, perfil_id)
);

create table if not exists vistas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  nombre text not null,
  consulta text not null,
  creado_en timestamptz not null default now()
);

create table if not exists guardias (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references sectores(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  desde date not null,
  hasta date not null
);

create table if not exists sla_especiales (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizaciones(id) on delete cascade,
  categoria_id uuid references categorias(id) on delete cascade,
  prioridad text not null references sla_politicas(prioridad),
  minutos_respuesta int not null,
  minutos_resolucion int not null,
  check (organizacion_id is not null or categoria_id is not null)
);

create table if not exists reglas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  -- condiciones: { categoria_id, organizacion_id, sector_id, canal, contiene }   (las vacías no se evalúan)
  cond jsonb not null default '{}',
  -- acciones: { prioridad, sector_id, asignado_id, confidencial, avisar_email }
  acc jsonb not null default '{}'
);

insert into config (clave, valor) values
  ('mantenimiento', '{"cerrar_resueltos_dias": 7, "recordar_espera_dias": 3, "borrar_adjuntos_meses": 0, "tablero_solo_supervisores": false}'),
  ('mails', '{"firma": "", "pie": ""}'),
  ('reporte', '{"destinatarios": ""}')
on conflict (clave) do nothing;

-- ---------- SLA con tiempos especiales por organización o categoría ----------
-- Gana la regla más específica: organización + categoría, después organización, después categoría.

create or replace function tk_sla(p_prioridad text, p_org uuid, p_cat uuid, out resp int, out resol int)
language sql stable security definer set search_path = public as $$
  select x.minutos_respuesta, x.minutos_resolucion from (
    select e.minutos_respuesta, e.minutos_resolucion,
           (e.organizacion_id is not null)::int * 2 + (e.categoria_id is not null)::int as peso
    from sla_especiales e
    where e.prioridad = p_prioridad
      and (e.organizacion_id is null or e.organizacion_id = p_org)
      and (e.categoria_id is null or e.categoria_id = p_cat)
    union all
    select s.minutos_respuesta, s.minutos_resolucion, -1 from sla_politicas s where s.prioridad = p_prioridad
  ) x order by x.peso desc limit 1
$$;

create or replace function tk_ticket_antes() returns trigger
language plpgsql as $$
declare
  r int; s int; delta int;
begin
  select resp, resol into r, s from tk_sla(new.prioridad, new.organizacion_id, new.categoria_id);

  if tg_op = 'INSERT'
     or new.prioridad is distinct from old.prioridad
     or new.organizacion_id is distinct from old.organizacion_id
     or new.categoria_id is distinct from old.categoria_id then
    if r is not null then
      new.vence_respuesta := tk_sumar_habil(new.creado_en, r);
      new.vence_resolucion := tk_sumar_habil(new.creado_en, s + new.minutos_pausa_habil);
      new.alerta_resolucion := false;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if old.estado = 'en_espera' and old.en_espera_desde is not null then
      delta := greatest(0, extract(epoch from (now() - old.en_espera_desde))::int);
      new.segundos_pausa := old.segundos_pausa + delta;
      new.minutos_pausa_habil := old.minutos_pausa_habil + tk_minutos_habiles(old.en_espera_desde, now());
      if s is not null then
        new.vence_resolucion := tk_sumar_habil(new.creado_en, s + new.minutos_pausa_habil);
      end if;
      new.en_espera_desde := null;
    end if;
    if new.estado = 'en_espera' then
      new.en_espera_desde := now();
      new.recordatorio_en := null;
    end if;
    if new.estado in ('resuelto','cerrado') and new.resuelto_en is null then
      new.resuelto_en := now();
    end if;
    if new.estado in ('abierto','en_curso','en_espera') and old.estado in ('resuelto','cerrado') then
      new.resuelto_en := null;
      new.alerta_resolucion := false;
      new.escalado_en := null;
    end if;
  end if;

  -- Los tickets importados conservan su fecha de última actividad.
  if not (tg_op = 'INSERT' and new.canal = 'importado') then
    new.actualizado_en := now();
  end if;
  return new;
end $$;

create or replace function tk_recalcular_sla() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update tickets t set
    vence_respuesta = tk_sumar_habil(t.creado_en, x.resp),
    vence_resolucion = tk_sumar_habil(t.creado_en, x.resol + t.minutos_pausa_habil)
  from tickets t2, lateral tk_sla(t2.prioridad, t2.organizacion_id, t2.categoria_id) x
  where t2.id = t.id and x.resp is not null and t.estado in ('abierto','en_curso','en_espera');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function tk_recalcular_sla() from public, anon, authenticated;
grant execute on function tk_recalcular_sla() to service_role;

-- Suma el tiempo trabajado al ticket
create or replace function tk_tiempo_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update tickets set minutos_trabajados = coalesce((select sum(minutos) from tiempos where ticket_id = coalesce(new.ticket_id, old.ticket_id)), 0)
  where id = coalesce(new.ticket_id, old.ticket_id);
  return null;
end $$;
drop trigger if exists tk_tiempo_despues_trg on tiempos;
create trigger tk_tiempo_despues_trg after insert or delete on tiempos for each row execute function tk_tiempo_despues();

-- ---------- Visibilidad: los tickets en la papelera no los ve nadie desde la app ----------
create or replace function tk_ve_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from tickets t
    join perfiles yo on yo.id = auth.uid()
    where t.id = p_ticket and t.eliminado_en is null and yo.activo and (
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
alter table tiempos enable row level security;
alter table presencia enable row level security;
alter table vistas enable row level security;
alter table guardias enable row level security;
alter table sla_especiales enable row level security;
alter table reglas enable row level security;

drop policy if exists tiempos_leer on tiempos;
create policy tiempos_leer on tiempos for select to authenticated using (tk_es_staff() and tk_ve_ticket(ticket_id));
drop policy if exists presencia_leer on presencia;
create policy presencia_leer on presencia for select to authenticated using (tk_es_staff() and tk_ve_ticket(ticket_id));
drop policy if exists vistas_leer on vistas;
create policy vistas_leer on vistas for select to authenticated using (perfil_id = auth.uid());
drop policy if exists guardias_leer on guardias;
create policy guardias_leer on guardias for select to authenticated using (tk_es_staff());
drop policy if exists sla_especiales_leer on sla_especiales;
create policy sla_especiales_leer on sla_especiales for select to authenticated using (tk_es_staff());
drop policy if exists reglas_leer on reglas;
create policy reglas_leer on reglas for select to authenticated using (tk_rol() = 'admin');
