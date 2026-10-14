-- ============================================================
-- 010 — Personas desde Entra ID (Microsoft 365)
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 009_diagnostico_turnos_equipo.sql
-- y ANTES de subir el código nuevo. Se puede correr más de una vez.
--
-- Desk lee los usuarios de Entra (nombre, área, puesto, jefe y si la cuenta está habilitada) y los aplica
-- a las personas de Desk que tienen el mismo mail. Quien todavía no entró nunca a Desk queda "en espera":
-- la primera vez que ingrese (con Microsoft o con mail), su perfil se completa solo.
-- ============================================================

alter table perfiles add column if not exists entra_id text;
alter table perfiles add column if not exists area text not null default '';
alter table perfiles add column if not exists puesto text not null default '';
alter table perfiles add column if not exists entra_visto timestamptz;
alter table perfiles add column if not exists desactivado_por_entra boolean not null default false;
create unique index if not exists perfiles_entra_idx on perfiles(entra_id) where entra_id is not null;

-- Copia de lo último que devolvió Entra ID
create table if not exists entra_usuarios (
  entra_id text primary key,
  email text not null,
  nombre text not null default '',
  area text not null default '',
  puesto text not null default '',
  jefe_entra_id text,
  activo boolean not null default true,
  actualizado timestamptz not null default now()
);
create index if not exists entra_usuarios_email_idx on entra_usuarios(lower(email));
alter table entra_usuarios enable row level security;
drop policy if exists entra_usuarios_leer on entra_usuarios;
create policy entra_usuarios_leer on entra_usuarios for select to authenticated using (tk_es_staff());

-- Aplica los datos de Entra a una persona (y a quienes la tienen como jefe)
create or replace function tk_entra_completar(p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e entra_usuarios; v_jefe uuid;
begin
  select u.* into e from entra_usuarios u join perfiles p on lower(p.email) = lower(u.email) where p.id = p_perfil limit 1;
  if e.entra_id is null then return; end if;
  -- Si ya hay otro perfil con ese entra_id (mail cambiado), no se pisa
  if exists (select 1 from perfiles where entra_id = e.entra_id and id <> p_perfil) then return; end if;
  select id into v_jefe from perfiles where entra_id = e.jefe_entra_id and id <> p_perfil;
  update perfiles set
    entra_id = e.entra_id,
    nombre = case when e.nombre <> '' then e.nombre else nombre end,
    area = e.area, puesto = e.puesto, tipo = 'interno',
    jefe_id = coalesce(v_jefe, jefe_id),
    entra_visto = now()
  where id = p_perfil;
  -- Quienes reportan a esta persona y ya tienen perfil
  update perfiles p set jefe_id = p_perfil
    from entra_usuarios u
   where p.entra_id = u.entra_id and u.jefe_entra_id = e.entra_id and p.jefe_id is distinct from p_perfil;
end $$;
revoke all on function tk_entra_completar(uuid) from public, anon, authenticated;

create or replace function tk_perfil_entra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform tk_entra_completar(new.id);
  return null;
exception when others then
  return null;   -- nunca impedir el alta de una persona
end $$;
drop trigger if exists tk_perfil_entra_trg on perfiles;
create trigger tk_perfil_entra_trg after insert on perfiles for each row execute function tk_perfil_entra();

-- Sincronización completa: la llama el servidor de Desk (clave de servicio) con la lista de Entra.
-- p: [{entra_id, email, nombre, area, puesto, jefe_entra_id, activo}]
create or replace function tk_entra_sincronizar(p jsonb, p_desactivar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb := '{}'::jsonb;
  n int;
  v_admins text[];
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    raise exception 'Entra ID no devolvió usuarios: no se aplicó ningún cambio';
  end if;

  -- 1. Copia nueva de Entra
  delete from entra_usuarios;
  insert into entra_usuarios (entra_id, email, nombre, area, puesto, jefe_entra_id, activo)
  select distinct on (x ->> 'entra_id')
         x ->> 'entra_id', lower(x ->> 'email'), coalesce(x ->> 'nombre', ''), coalesce(x ->> 'area', ''),
         coalesce(x ->> 'puesto', ''), nullif(x ->> 'jefe_entra_id', ''), coalesce((x ->> 'activo')::boolean, true)
    from jsonb_array_elements(p) x
   where coalesce(x ->> 'entra_id', '') <> '' and coalesce(x ->> 'email', '') <> '';

  -- 2. Vincular por mail a quienes todavía no estaban vinculados
  update perfiles pf set entra_id = u.entra_id
    from entra_usuarios u
   where pf.entra_id is null and lower(pf.email) = lower(u.email)
     and not exists (select 1 from perfiles o where o.entra_id = u.entra_id);
  get diagnostics n = row_count; r := r || jsonb_build_object('vinculados', n);

  -- 3. Nombre, área, puesto (y queda como personal interno)
  update perfiles pf set
    nombre = case when u.nombre <> '' then u.nombre else pf.nombre end,
    area = u.area, puesto = u.puesto, tipo = 'interno', entra_visto = now()
    from entra_usuarios u
   where pf.entra_id = u.entra_id
     and (pf.nombre is distinct from case when u.nombre <> '' then u.nombre else pf.nombre end
          or pf.area is distinct from u.area or pf.puesto is distinct from u.puesto or pf.tipo <> 'interno');
  get diagnostics n = row_count; r := r || jsonb_build_object('actualizados', n);
  update perfiles pf set entra_visto = now() from entra_usuarios u where pf.entra_id = u.entra_id;

  -- 4. Jefe (si Entra no tiene jefe cargado, se respeta el que se puso a mano en Desk)
  update perfiles pf set jefe_id = j.id
    from entra_usuarios u join perfiles j on j.entra_id = u.jefe_entra_id
   where pf.entra_id = u.entra_id and j.id <> pf.id and pf.jefe_id is distinct from j.id;
  get diagnostics n = row_count; r := r || jsonb_build_object('jefes', n);

  -- 5. Cuentas deshabilitadas o borradas en Entra (nunca se desactiva a un administrador: se informa)
  if p_desactivar then
    select coalesce(array_agg(pf.email), '{}') into v_admins
      from perfiles pf left join entra_usuarios u on u.entra_id = pf.entra_id
     where pf.entra_id is not null and pf.activo and pf.rol = 'admin' and coalesce(u.activo, false) = false;

    update perfiles pf set activo = false, desactivado_por_entra = true
      from (select pf2.id from perfiles pf2 left join entra_usuarios u on u.entra_id = pf2.entra_id
             where pf2.entra_id is not null and pf2.activo and pf2.rol <> 'admin' and coalesce(u.activo, false) = false) x
     where pf.id = x.id;
    get diagnostics n = row_count; r := r || jsonb_build_object('desactivados', n, 'admins_sin_desactivar', to_jsonb(v_admins));

    -- Vuelven a estar habilitadas en Entra: se reactivan solo las que desactivó la sincronización
    update perfiles pf set activo = true, desactivado_por_entra = false
      from entra_usuarios u
     where pf.entra_id = u.entra_id and u.activo and not pf.activo and pf.desactivado_por_entra;
    get diagnostics n = row_count; r := r || jsonb_build_object('reactivados', n);
  end if;

  select count(*) into n from entra_usuarios u where u.activo and not exists (select 1 from perfiles pf where pf.entra_id = u.entra_id);
  r := r || jsonb_build_object('sin_ingresar', n, 'en_entra', (select count(*) from entra_usuarios));
  return r;
end $$;
revoke all on function tk_entra_sincronizar(jsonb, boolean) from public, anon, authenticated;
