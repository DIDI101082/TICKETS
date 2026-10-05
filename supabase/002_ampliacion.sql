-- ============================================================
-- Mesa de Ayuda — ampliación 002
-- Ejecutar DESPUÉS de schema.sql, en Supabase > SQL Editor. Se puede correr más de una vez.
-- Suma: organizaciones, categorías con formulario, plantillas, encuesta, SLA en horario hábil,
-- restricción por sector, tickets confidenciales, aprobaciones, vínculos y fusión,
-- tickets programados, monitoreo, escalamiento y auditoría.
-- ============================================================

-- ---------- Tablas nuevas ----------

create table if not exists organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- dominios de mail separados por coma: quien se registra con ese dominio queda en la organización
  dominios text not null default '',
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text not null default '',
  sector_id uuid references sectores(id) on delete set null,
  prioridad text references sla_politicas(prioridad),
  -- [{ "etiqueta": "...", "tipo": "texto|parrafo|lista", "opciones": ["..."], "requerido": true }]
  campos jsonb not null default '[]',
  requiere_aprobacion boolean not null default false,
  confidencial boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0
);

create table if not exists plantillas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cuerpo text not null,
  creado_en timestamptz not null default now()
);

create table if not exists config (
  clave text primary key,
  valor jsonb not null
);

create table if not exists feriados (
  fecha date primary key,
  nombre text not null default ''
);

create table if not exists programados (
  id uuid primary key default gen_random_uuid(),
  asunto text not null,
  descripcion text not null default '',
  sector_id uuid references sectores(id) on delete set null,
  prioridad text not null default 'media' references sla_politicas(prioridad),
  frecuencia text not null default 'semanal' check (frecuencia in ('diaria','semanal','mensual')),
  proxima date not null,
  ultima date,
  activo boolean not null default true
);

create table if not exists auditoria (
  id bigint generated always as identity primary key,
  creado_en timestamptz not null default now(),
  actor_id uuid,
  actor_nombre text not null default '',
  accion text not null,
  entidad text not null default '',
  entidad_id text not null default '',
  detalle text not null default ''
);
create index if not exists auditoria_fecha_idx on auditoria(creado_en desc);

-- ---------- Columnas nuevas ----------

alter table perfiles add column if not exists organizacion_id uuid references organizaciones(id) on delete set null;
-- "referente": puede ver todos los tickets de su organización, no solo los propios
alter table perfiles add column if not exists ve_organizacion boolean not null default false;

alter table sectores add column if not exists responsable_id uuid references perfiles(id) on delete set null;

alter table tickets add column if not exists organizacion_id uuid references organizaciones(id) on delete set null;
alter table tickets add column if not exists categoria_id uuid references categorias(id) on delete set null;
alter table tickets add column if not exists datos jsonb not null default '[]';
alter table tickets add column if not exists equipo text not null default '';
alter table tickets add column if not exists confidencial boolean not null default false;
alter table tickets add column if not exists padre_id uuid references tickets(id) on delete set null;
alter table tickets add column if not exists fusionado_en_id uuid references tickets(id) on delete set null;
alter table tickets add column if not exists aprobacion_estado text not null default 'no_requiere';
alter table tickets add column if not exists aprobador_id uuid references perfiles(id) on delete set null;
alter table tickets add column if not exists aprobacion_nota text not null default '';
alter table tickets add column if not exists aprobacion_en timestamptz;
alter table tickets add column if not exists csat_puntaje int;
alter table tickets add column if not exists csat_comentario text not null default '';
alter table tickets add column if not exists csat_en timestamptz;
alter table tickets add column if not exists resumen text;
alter table tickets add column if not exists resumen_en timestamptz;
alter table tickets add column if not exists escalado_en timestamptz;
alter table tickets add column if not exists incidente boolean not null default false;
alter table tickets add column if not exists clave_externa text;
alter table tickets add column if not exists minutos_pausa_habil numeric not null default 0;

alter table tickets drop constraint if exists tickets_canal_check;
alter table tickets add constraint tickets_canal_check check (canal in ('portal','email','teams','monitoreo','programado'));
alter table tickets drop constraint if exists tickets_aprobacion_check;
alter table tickets add constraint tickets_aprobacion_check check (aprobacion_estado in ('no_requiere','pendiente','aprobado','rechazado'));
alter table tickets drop constraint if exists tickets_csat_check;
alter table tickets add constraint tickets_csat_check check (csat_puntaje is null or csat_puntaje between 1 and 5);

create index if not exists tickets_org_idx on tickets(organizacion_id);
create index if not exists tickets_padre_idx on tickets(padre_id);
create index if not exists tickets_clave_idx on tickets(clave_externa);
create index if not exists tickets_equipo_idx on tickets(equipo) where equipo <> '';

create table if not exists ticket_acceso (
  ticket_id uuid not null references tickets(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  primary key (ticket_id, perfil_id)
);

-- La pausa acumulada antes de esta ampliación pasa a la columna nueva
update tickets set minutos_pausa_habil = segundos_pausa / 60.0 where minutos_pausa_habil = 0 and segundos_pausa > 0;

-- ---------- Configuración inicial ----------

insert into config (clave, valor) values
  ('horario', '{"activo": false, "dias": [1,2,3,4,5], "desde": "09:00", "hasta": "18:00", "zona": "America/Argentina/Buenos_Aires"}'),
  ('opciones', '{"restringir_sector": false, "escalar_sin_tomar_min": 120, "incidente_cantidad": 4, "incidente_minutos": 30}')
on conflict (clave) do nothing;

insert into categorias (nombre, descripcion, sector_id, campos, requiere_aprobacion, confidencial, orden) values
  ('Falla de equipo', 'La PC, notebook, impresora o periférico no funciona bien',
    (select id from sectores where nombre = 'CAU'),
    '[{"etiqueta":"Equipo o n.º de inventario","tipo":"texto","opciones":[],"requerido":false},{"etiqueta":"¿Desde cuándo pasa?","tipo":"texto","opciones":[],"requerido":false},{"etiqueta":"¿Podés seguir trabajando?","tipo":"lista","opciones":["Sí","Con dificultad","No"],"requerido":true}]',
    false, false, 1),
  ('Acceso o contraseña', 'No puedo ingresar, me bloqueé o necesito un permiso',
    (select id from sectores where nombre = 'CAU'),
    '[{"etiqueta":"Sistema o servicio","tipo":"texto","opciones":[],"requerido":true}]',
    false, false, 2),
  ('Red, VPN o servidores', 'Problemas de conexión, VPN, wifi o servicios caídos',
    (select id from sectores where nombre = 'Infraestructura'),
    '[{"etiqueta":"¿A cuántas personas afecta?","tipo":"lista","opciones":["Solo a mí","A mi equipo","A toda la oficina"],"requerido":true}]',
    false, false, 3),
  ('Alta de usuario', 'Ingreso de una persona nueva: cuenta, equipo y accesos',
    (select id from sectores where nombre = 'CAU'),
    '[{"etiqueta":"Nombre y apellido","tipo":"texto","opciones":[],"requerido":true},{"etiqueta":"Área","tipo":"texto","opciones":[],"requerido":true},{"etiqueta":"Fecha de ingreso","tipo":"texto","opciones":[],"requerido":true},{"etiqueta":"Accesos y equipo que necesita","tipo":"parrafo","opciones":[],"requerido":false}]',
    true, false, 4),
  ('Consulta de RRHH', 'Licencias, recibos, beneficios y consultas personales',
    (select id from sectores where nombre = 'RRHH'), '[]', false, true, 5),
  ('Compras y pagos', 'Pedidos de compra, facturas, proveedores y pagos',
    (select id from sectores where nombre = 'Administración'),
    '[{"etiqueta":"Monto estimado","tipo":"texto","opciones":[],"requerido":false}]',
    true, false, 6),
  ('Otro pedido', 'No encuentro la categoría: lo deriva el sistema', null, '[]', false, false, 99)
on conflict (nombre) do nothing;

insert into plantillas (titulo, cuerpo)
select * from (values
  ('Pedido recibido', 'Hola {{nombre}}, recibimos tu pedido #{{numero}} y ya lo estamos revisando. Te avisamos apenas tengamos novedades.'),
  ('Necesitamos más datos', 'Hola {{nombre}}, para avanzar con tu pedido necesitamos que nos cuentes un poco más: qué mensaje de error aparece, desde cuándo pasa y si le ocurre a alguien más.'),
  ('Resuelto', 'Hola {{nombre}}, tu pedido #{{numero}} quedó resuelto. Si el problema vuelve a aparecer, respondé este mensaje y lo retomamos.')
) as v(titulo, cuerpo)
where not exists (select 1 from plantillas);

-- ---------- Horario hábil ----------

create or replace function tk_horario() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from config where clave = 'horario'), '{"activo": false}'::jsonb)
$$;

-- Suma minutos de trabajo a una fecha. Con el horario desactivado, suma minutos corridos.
create or replace function tk_sumar_habil(inicio timestamptz, minutos numeric) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  h jsonb := tk_horario();
  zona text; desde time; hasta time; dias int[];
  d date; resto interval := make_interval(secs => greatest(minutos, 0) * 60);
  ini timestamptz; fin timestamptz; i int := 0;
begin
  if not coalesce((h->>'activo')::boolean, false) or minutos <= 0 then return inicio + resto; end if;
  zona := coalesce(h->>'zona', 'America/Argentina/Buenos_Aires');
  desde := (h->>'desde')::time; hasta := (h->>'hasta')::time;
  select array_agg(x::int) into dias from jsonb_array_elements_text(h->'dias') x;
  if dias is null or hasta <= desde then return inicio + resto; end if;

  d := (inicio at time zone zona)::date;
  while i < 800 loop
    if extract(isodow from d)::int = any(dias) and not exists (select 1 from feriados f where f.fecha = d) then
      ini := greatest(inicio, (d + desde) at time zone zona);
      fin := (d + hasta) at time zone zona;
      if ini < fin then
        if fin - ini >= resto then return ini + resto; end if;
        resto := resto - (fin - ini);
      end if;
    end if;
    d := d + 1; i := i + 1;
  end loop;
  return inicio + make_interval(secs => minutos * 60);
end $$;

-- Minutos de trabajo transcurridos entre dos fechas.
create or replace function tk_minutos_habiles(a timestamptz, b timestamptz) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  h jsonb := tk_horario();
  zona text; desde time; hasta time; dias int[];
  d date; ultimo date; total numeric := 0; ini timestamptz; fin timestamptz; i int := 0;
begin
  if a is null or b is null or b <= a then return 0; end if;
  if not coalesce((h->>'activo')::boolean, false) then return extract(epoch from (b - a)) / 60; end if;
  zona := coalesce(h->>'zona', 'America/Argentina/Buenos_Aires');
  desde := (h->>'desde')::time; hasta := (h->>'hasta')::time;
  select array_agg(x::int) into dias from jsonb_array_elements_text(h->'dias') x;
  if dias is null or hasta <= desde then return extract(epoch from (b - a)) / 60; end if;

  d := (a at time zone zona)::date; ultimo := (b at time zone zona)::date;
  while d <= ultimo and i < 800 loop
    if extract(isodow from d)::int = any(dias) and not exists (select 1 from feriados f where f.fecha = d) then
      ini := greatest(a, (d + desde) at time zone zona);
      fin := least(b, (d + hasta) at time zone zona);
      if ini < fin then total := total + extract(epoch from (fin - ini)) / 60; end if;
    end if;
    d := d + 1; i := i + 1;
  end loop;
  return total;
end $$;

-- Reemplaza al disparador de schema.sql: mismos vencimientos, ahora en horario hábil.
create or replace function tk_ticket_antes() returns trigger
language plpgsql as $$
declare
  p sla_politicas;
  delta int;
begin
  select * into p from sla_politicas where prioridad = new.prioridad;

  if tg_op = 'INSERT' or new.prioridad is distinct from old.prioridad then
    if p.prioridad is not null then
      new.vence_respuesta := tk_sumar_habil(new.creado_en, p.minutos_respuesta);
      new.vence_resolucion := tk_sumar_habil(new.creado_en, p.minutos_resolucion + new.minutos_pausa_habil);
      new.alerta_resolucion := false;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if old.estado = 'en_espera' and old.en_espera_desde is not null then
      delta := greatest(0, extract(epoch from (now() - old.en_espera_desde))::int);
      new.segundos_pausa := old.segundos_pausa + delta;
      new.minutos_pausa_habil := old.minutos_pausa_habil + tk_minutos_habiles(old.en_espera_desde, now());
      if p.prioridad is not null then
        new.vence_resolucion := tk_sumar_habil(new.creado_en, p.minutos_resolucion + new.minutos_pausa_habil);
      end if;
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
      new.escalado_en := null;
    end if;
  end if;

  new.actualizado_en := now();
  return new;
end $$;

-- Recalcula los vencimientos de los tickets activos (después de cambiar horario, feriados o tiempos).
create or replace function tk_recalcular_sla() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update tickets t set
    vence_respuesta = tk_sumar_habil(t.creado_en, p.minutos_respuesta),
    vence_resolucion = tk_sumar_habil(t.creado_en, p.minutos_resolucion + t.minutos_pausa_habil)
  from sla_politicas p
  where p.prioridad = t.prioridad and t.estado in ('abierto','en_curso','en_espera');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function tk_recalcular_sla() from public, anon, authenticated;
grant execute on function tk_recalcular_sla() to service_role;

-- ---------- Alta de usuario: asigna la organización por dominio del mail ----------

create or replace function tk_usuario_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select o.id into org from organizaciones o
  where o.activo and lower(split_part(coalesce(new.email, ''), '@', 2)) = any (string_to_array(replace(lower(o.dominios), ' ', ''), ','))
  limit 1;

  insert into perfiles (id, email, nombre, rol, organizacion_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    case when not exists (select 1 from perfiles) then 'admin' else 'usuario' end,
    org
  )
  on conflict (id) do nothing;

  if new.email_confirmed_at is not null and new.email is not null then
    update tickets set solicitante_id = new.id
    where solicitante_id is null and lower(solicitante_email) = lower(new.email);
  end if;
  return new;
end $$;

-- ---------- Quién puede ver cada ticket ----------
-- Solicitante, aprobador y administradores: siempre.
-- Agentes: asignado o con acceso explícito siempre; el resto según confidencialidad y,
--          si está activada la restricción, según sus sectores (el triage lo ven todos los agentes).
-- Referentes de una organización: los tickets no confidenciales de su organización.

create or replace function tk_ve_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from tickets t
    join perfiles yo on yo.id = auth.uid()
    where t.id = p_ticket and (
      t.solicitante_id = yo.id
      or t.aprobador_id = yo.id
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

drop policy if exists tickets_leer on tickets;
create policy tickets_leer on tickets for select to authenticated using (tk_ve_ticket(id));

drop policy if exists mensajes_leer on mensajes;
create policy mensajes_leer on mensajes for select to authenticated
  using (tk_ve_ticket(ticket_id) and (not interno or tk_es_staff()));

drop policy if exists adjuntos_leer on adjuntos;
create policy adjuntos_leer on adjuntos for select to authenticated
  using (
    tk_ve_ticket(ticket_id)
    and (tk_es_staff() or mensaje_id is null or exists (select 1 from mensajes m where m.id = mensaje_id and not m.interno))
  );

drop policy if exists eventos_leer on eventos;
create policy eventos_leer on eventos for select to authenticated using (tk_es_staff() and tk_ve_ticket(ticket_id));

-- ---------- Seguridad por fila de las tablas nuevas ----------

alter table organizaciones enable row level security;
alter table categorias enable row level security;
alter table plantillas enable row level security;
alter table config enable row level security;
alter table feriados enable row level security;
alter table programados enable row level security;
alter table auditoria enable row level security;
alter table ticket_acceso enable row level security;

drop policy if exists organizaciones_leer on organizaciones;
create policy organizaciones_leer on organizaciones for select to authenticated
  using (tk_es_staff() or id = (select organizacion_id from perfiles where perfiles.id = auth.uid()));

drop policy if exists categorias_leer on categorias;
create policy categorias_leer on categorias for select to authenticated using (true);

drop policy if exists plantillas_leer on plantillas;
create policy plantillas_leer on plantillas for select to authenticated using (tk_es_staff());

drop policy if exists config_leer on config;
create policy config_leer on config for select to authenticated using (tk_es_staff());

drop policy if exists feriados_leer on feriados;
create policy feriados_leer on feriados for select to authenticated using (tk_es_staff());

drop policy if exists programados_leer on programados;
create policy programados_leer on programados for select to authenticated using (tk_es_staff());

drop policy if exists ticket_acceso_leer on ticket_acceso;
create policy ticket_acceso_leer on ticket_acceso for select to authenticated using (tk_es_staff());

drop policy if exists auditoria_leer on auditoria;
create policy auditoria_leer on auditoria for select to authenticated using (tk_rol() = 'admin');
