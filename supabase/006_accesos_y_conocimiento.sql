-- ============================================================
-- 006 — Accesos con vencimiento y artículos desde tickets
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 005_administracion.sql
-- y ANTES de subir el código nuevo. Se puede correr más de una vez.
-- ============================================================

-- ---------- Categorías que otorgan accesos ----------
-- es_acceso: al resolver un pedido de esta categoría se registra el acceso otorgado.
-- acceso_dias_max: duración que se usa si el pedido no trae una fecha de fin válida (vacío = sin límite).
-- recertificar_dias: cada cuántos días se pregunta si un acceso sin fecha de fin sigue haciendo falta.
alter table categorias add column if not exists es_acceso boolean not null default false;
alter table categorias add column if not exists acceso_dias_max int check (acceso_dias_max is null or acceso_dias_max between 1 and 3650);
alter table categorias add column if not exists recertificar_dias int not null default 90 check (recertificar_dias between 7 and 730);

-- ---------- Accesos otorgados ----------
create table if not exists accesos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete set null,          -- pedido que lo otorgó
  categoria_id uuid references categorias(id) on delete set null,
  sector_id uuid references sectores(id) on delete set null,         -- quién lo administra (y revoca)
  persona_nombre text not null default '',
  persona_email text not null default '',
  persona_id uuid references perfiles(id) on delete set null,
  sistema text not null default '',                                  -- ej.: "Permisos en AWS · prod-core · Administrador"
  otorgado_en timestamptz not null default now(),
  hasta timestamptz,                                                 -- null = sin fecha de fin (se recertifica)
  fecha_estimada boolean not null default false,                     -- la fecha de fin no venía en el pedido: se calculó
  estado text not null default 'vigente' check (estado in ('vigente','revocacion_pendiente','revocado')),
  aviso_enviado_en timestamptz,                                      -- aviso de vencimiento próximo
  revocar_ticket_id uuid references tickets(id) on delete set null,  -- ticket para quitar el acceso
  revocado_en timestamptz,
  revocado_por text not null default '',
  recertificado_en timestamptz,
  recertificar_token text,
  recertificar_pedido_en timestamptz,
  responsable_id uuid references perfiles(id) on delete set null,    -- quien confirma si sigue haciendo falta
  notas text not null default '',
  creado_en timestamptz not null default now()
);
create unique index if not exists accesos_ticket_idx on accesos(ticket_id) where ticket_id is not null;
create index if not exists accesos_estado_idx on accesos(estado, hasta);
create index if not exists accesos_persona_idx on accesos(persona_id);
create index if not exists accesos_revocar_idx on accesos(revocar_ticket_id) where revocar_ticket_id is not null;
create unique index if not exists accesos_token_idx on accesos(recertificar_token) where recertificar_token is not null;

-- ---------- Interpretar la fecha que escribió la persona ----------
-- Acepta 20/10/2026, 20/10/2026 18:00, 20-10-26 18hs y 2026-10-20T18:00. Sin hora, se toma el final del día.
create or replace function tk_leer_fecha(p text) returns timestamptz
language plpgsql stable set search_path = public as $$
declare
  m text[];
  zona text := coalesce((select valor->>'zona' from config where clave = 'horario'), 'America/Argentina/Buenos_Aires');
  anio int; hh int := 23; mi int := 59;
begin
  if p is null then return null; end if;
  m := regexp_match(p, '(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?');
  if m is not null then
    if m[4] is not null then hh := m[4]::int; mi := m[5]::int; end if;
    return make_timestamptz(m[1]::int, m[2]::int, m[3]::int, hh, mi, 0, zona);
  end if;
  m := regexp_match(p, '(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:,?\s+(?:a las\s+)?(\d{1,2})(?:[:.](\d{2})|\s*(?:hs|hrs|h)\y))?');
  if m is not null then
    anio := m[3]::int; if anio < 100 then anio := anio + 2000; end if;
    if m[4] is not null then hh := m[4]::int; mi := coalesce(m[5], '0')::int; end if;
    return make_timestamptz(anio, m[2]::int, m[1]::int, hh, mi, 0, zona);
  end if;
  return null;
exception when others then
  return null;
end $$;

-- ---------- Registro automático al resolver un pedido de acceso ----------
create or replace function tk_registrar_acceso(p_ticket uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t tickets;
  c categorias;
  v_persona text; v_email text; v_pid uuid;
  v_hasta timestamptz; v_estimada boolean := false; v_permanente boolean := false;
  v_sistema text; v_id uuid; v_resp uuid; d jsonb;
begin
  select * into t from tickets where id = p_ticket;
  if t.id is null or t.categoria_id is null or t.aprobacion_estado = 'rechazado'
     or t.fusionado_en_id is not null or t.eliminado_en is not null then return null; end if;
  select * into c from categorias where id = t.categoria_id;
  if c.id is null or not c.es_acceso then return null; end if;
  if exists (select 1 from accesos where ticket_id = t.id) then return null; end if;

  -- Persona: el campo "Persona que necesita el acceso", si no la persona para quien se pidió, si no quien lo pidió
  select d2->>'valor' into v_persona from jsonb_array_elements(t.datos) d2
   where d2->>'etiqueta' ~* '^persona' and coalesce(d2->>'valor', '') <> '' limit 1;
  v_email := lower(substring(coalesce(v_persona, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'));
  if v_persona is null then
    if t.beneficiario_id is not null then
      select nombre, email, id into v_persona, v_email, v_pid from perfiles where id = t.beneficiario_id;
    else
      v_persona := nullif(t.solicitante_nombre, ''); v_email := lower(t.solicitante_email); v_pid := t.solicitante_id;
    end if;
  end if;
  if v_persona is not null and coalesce(v_email, '') <> '' then
    -- Se deja el nombre sin el mail
    v_persona := nullif(trim(both ' ,;:-<>()' from regexp_replace(v_persona, '<?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>?', '', 'g')), '');
  elsif v_persona is not null then
    -- Sin mail: si es quien lo pidió (o para quien lo pidió), se toman sus datos; si no, una cuenta con ese nombre exacto
    if t.solicitante_nombre <> '' and (t.solicitante_nombre ilike v_persona || '%' or v_persona ilike t.solicitante_nombre || '%') then
      v_email := lower(t.solicitante_email); v_pid := t.solicitante_id;
    elsif t.beneficiario_nombre <> '' and (t.beneficiario_nombre ilike v_persona || '%' or v_persona ilike t.beneficiario_nombre || '%') then
      select email, id into v_email, v_pid from perfiles where id = t.beneficiario_id;
    else
      select lower(email), id into v_email, v_pid from perfiles where lower(nombre) = lower(trim(v_persona)) and activo limit 1;
    end if;
  end if;
  if v_pid is null and coalesce(v_email, '') <> '' then select id into v_pid from perfiles where lower(email) = v_email; end if;

  -- Fecha de fin: el primer campo que diga "hasta" con una fecha válida; "Permanente" la deja abierta
  for d in select * from jsonb_array_elements(t.datos) loop
    if d->>'etiqueta' ~* 'duraci' and d->>'valor' ~* 'permanente' then v_permanente := true; end if;
    if v_hasta is null and d->>'etiqueta' ~* 'hasta' then v_hasta := tk_leer_fecha(d->>'valor'); end if;
  end loop;
  if v_permanente then v_hasta := null;
  elsif v_hasta is null and c.acceso_dias_max is not null then
    v_hasta := now() + make_interval(days => c.acceso_dias_max); v_estimada := true;
  end if;

  -- Qué sistema: la categoría y los datos que lo identifican (cuenta, ambiente, nivel, rol, proyecto…)
  select c.nombre || coalesce(' · ' || string_agg(d3->>'valor', ' · '), '') into v_sistema
    from jsonb_array_elements(t.datos) d3
   where d3->>'etiqueta' ~* '(cuenta|ambiente|nivel|rol$|proyecto|grupo de seguridad|organizaci|equipos|sistemas o servidores)'
     and coalesce(d3->>'valor', '') <> '';

  -- Responsable de recertificar: quien aprobó; si no, el responsable del sector
  v_resp := coalesce(t.aprobador_id, (select responsable_id from sectores where id = coalesce(c.sector_id, t.sector_id)));

  insert into accesos (ticket_id, categoria_id, sector_id, persona_nombre, persona_email, persona_id, sistema, hasta, fecha_estimada, responsable_id)
  values (t.id, c.id, coalesce(c.sector_id, t.sector_id), coalesce(v_persona, ''), coalesce(v_email, ''), v_pid,
          left(coalesce(v_sistema, c.nombre), 300), v_hasta, v_estimada, v_resp)
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    insert into eventos (ticket_id, autor_nombre, detalle)
    values (t.id, 'Sistema', 'Acceso registrado: ' || left(coalesce(v_sistema, c.nombre), 200) ||
            case when v_hasta is null then ' · sin fecha de fin (se recertifica cada ' || c.recertificar_dias || ' días)'
                 else ' · vence ' || to_char(v_hasta at time zone coalesce((select valor->>'zona' from config where clave = 'horario'), 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY HH24:MI')
                      || case when v_estimada then ' (fecha estimada: el pedido no traía una válida)' else '' end end);
  end if;
  return v_id;
end $$;
revoke execute on function tk_registrar_acceso(uuid) from public, anon, authenticated;

create or replace function tk_ticket_accesos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('resuelto','cerrado') and old.estado not in ('resuelto','cerrado') then
    -- Pedido de acceso resuelto: se registra lo otorgado
    perform tk_registrar_acceso(new.id);
    -- Ticket de revocación resuelto: el acceso queda revocado
    update accesos set estado = 'revocado', revocado_en = now(),
           revocado_por = coalesce((select nombre from perfiles where id = new.asignado_id), 'Sistema')
     where revocar_ticket_id = new.id and estado <> 'revocado';
  end if;
  return new;
end $$;

drop trigger if exists tk_ticket_accesos_trg on tickets;
create trigger tk_ticket_accesos_trg
  after update of estado on tickets
  for each row execute function tk_ticket_accesos();

-- ---------- Artículos creados desde un ticket ----------
alter table articulos add column if not exists ticket_origen_id uuid references tickets(id) on delete set null;
create index if not exists articulos_ticket_idx on articulos(ticket_origen_id) where ticket_origen_id is not null;

-- ---------- Formularios de acceso: fechas con calendario y marca de acceso ----------
-- Los campos "Desde" / "Hasta" pasan a ser de tipo fecha (el portal muestra un calendario).
update categorias c set campos = (
  select jsonb_agg(case when x->>'etiqueta' ~* '^(desde|hasta)|hasta cuándo' then jsonb_set(x, '{tipo}', '"fecha"') else x end order by o)
  from jsonb_array_elements(c.campos) with ordinality as e(x, o)
)
where c.nombre in ('Acceso a VPN fuera del horario habitual', 'Permisos en AWS', 'Permisos en Azure DevOps')
  and jsonb_array_length(c.campos) > 0;

-- Sentry no pedía duración: se agrega igual que en AWS y Azure DevOps
update categorias set campos = campos || jsonb_build_array(
  jsonb_build_object('etiqueta', 'Duración', 'tipo', 'lista', 'requerido', true, 'opciones', jsonb_build_array('Permanente', 'Temporal')),
  jsonb_build_object('etiqueta', 'Si es temporal, hasta cuándo', 'tipo', 'fecha', 'requerido', false, 'opciones', '[]'::jsonb))
where nombre = 'Permisos en Sentry' and not campos @> '[{"etiqueta": "Duración"}]';

update categorias set es_acceso = true, acceso_dias_max = 30
 where nombre = 'Acceso a VPN fuera del horario habitual' and not es_acceso;
update categorias set es_acceso = true
 where nombre in ('Permisos en AWS', 'Permisos en Azure DevOps', 'Permisos en Sentry') and not es_acceso;

insert into config (clave, valor) values ('accesos', '{"aviso_dias": 3}') on conflict (clave) do nothing;

-- ---------- Seguridad por fila ----------
-- Las escrituras las hace el servidor de la app (service role) después de validar el rol.
alter table accesos enable row level security;
drop policy if exists accesos_leer on accesos;
create policy accesos_leer on accesos for select to authenticated
  using (tk_es_staff() or persona_id = auth.uid());
