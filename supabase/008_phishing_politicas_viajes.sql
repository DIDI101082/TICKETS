-- ============================================================
-- 008 — Reporte de phishing, políticas para aceptar y pedido de viaje o vacaciones
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 007_checklists_y_proactivo.sql
-- y ANTES de subir el código nuevo. Se puede correr más de una vez.
-- ============================================================

-- ---------- Categorías: consejos para quien pide y nombre del acceso ----------
alter table categorias add column if not exists consejos text;          -- se le muestran a quien carga el pedido
alter table categorias add column if not exists acceso_nombre text;     -- cómo se llama el acceso que otorga (si no, el nombre de la categoría)

-- ---------- Reporte de phishing ----------
create table if not exists phishing_analisis (
  ticket_id uuid primary key references tickets(id) on delete cascade,
  puntaje int not null default 0,
  nivel text not null default 'bajo' check (nivel in ('bajo', 'medio', 'alto')),
  remitente text not null default '',
  dominio text not null default '',
  asunto text not null default '',
  spf text, dkim text, dmarc text,
  indicadores jsonb not null default '[]',
  enlaces jsonb not null default '[]',
  adjuntos jsonb not null default '[]',
  hizo_clic text not null default 'no',
  con_archivo boolean not null default false,
  creado_en timestamptz not null default now()
);

insert into categorias (nombre, descripcion, sector_id, requiere_aprobacion, confidencial, activo, orden, campos, consejos)
values ('Reporte de phishing', 'Correo sospechoso reportado desde el botón "Reportar phishing" o por mail',
        (select id from sectores where nombre = 'Ciberseguridad'), false, false, false, 90, '[]',
        'No hagas clic en los enlaces ni abras los adjuntos del correo. Si ya lo hiciste o ingresaste tu contraseña, cambiala ahora y avisanos en este pedido.')
on conflict (nombre) do nothing;

-- Respuestas predefinidas para cerrar los reportes (cambian el estado a "resuelto")
insert into plantillas (titulo, cuerpo, estado_tras)
select v.titulo, v.cuerpo, 'resuelto' from (values
  ('Phishing: confirmado', 'Hola {{nombre}}, gracias por reportarlo: era un intento de phishing. Ya bloqueamos al remitente y los enlaces. Podés borrar el correo.' || chr(10) || chr(10) || 'Si llegaste a hacer clic o a ingresar tu contraseña, avisanos en este mismo pedido y te ayudamos a cambiarla.'),
  ('Phishing: correo legítimo', 'Hola {{nombre}}, revisamos el correo que reportaste y es legítimo, así que podés usarlo con tranquilidad. Gracias por consultarnos: ante la duda, siempre es mejor reportar.'),
  ('Phishing: spam o publicidad', 'Hola {{nombre}}, revisamos el correo: no es peligroso, pero es publicidad no deseada. Podés marcarlo como correo no deseado en Outlook para no recibir más de ese remitente.')
) as v(titulo, cuerpo)
where not exists (select 1 from plantillas p where p.titulo = v.titulo);

-- ---------- Políticas para leer y aceptar ----------
create table if not exists politicas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  version text not null default '1.0',
  resumen text not null default '',
  contenido text not null default '',          -- texto con formato simple (como los artículos)
  enlace text,                                  -- documento completo (SharePoint, PDF), opcional
  obligatoria boolean not null default true,
  alcance text not null default 'internos' check (alcance in ('internos', 'todos')),
  publicada boolean not null default false,
  publicada_en timestamptz,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create table if not exists politica_aceptaciones (
  politica_id uuid not null references politicas(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  version text not null,
  aceptada_en timestamptz not null default now(),
  primary key (politica_id, perfil_id, version)
);
create index if not exists politica_aceptaciones_perfil_idx on politica_aceptaciones(perfil_id);

-- ---------- Pedido de viaje o vacaciones ----------
insert into categorias (nombre, descripcion, sector_id, requiere_aprobacion, aprobador_jefe, confidencial, orden, es_acceso, acceso_nombre, campos, tareas, consejos)
values (
  'Viaje o vacaciones',
  'Me voy de vacaciones, de viaje o a trabajar desde otro lugar: VPN, respuesta automática y recomendaciones de seguridad en un solo pedido',
  (select id from sectores where nombre = 'CAU'), true, true, false, 5, true, 'VPN fuera del horario habitual',
  '[
    {"etiqueta": "Motivo", "tipo": "lista", "requerido": true, "opciones": ["Vacaciones", "Viaje laboral", "Trabajo remoto temporal"]},
    {"etiqueta": "Desde", "tipo": "fecha", "requerido": true, "opciones": []},
    {"etiqueta": "Hasta", "tipo": "fecha", "requerido": true, "opciones": []},
    {"etiqueta": "Destino (país y ciudad)", "tipo": "texto", "requerido": true, "opciones": []},
    {"etiqueta": "¿Llevás la notebook de la empresa?", "tipo": "lista", "requerido": true, "opciones": ["Sí", "No"]},
    {"etiqueta": "¿Necesitás VPN fuera del horario habitual?", "tipo": "lista", "requerido": true, "opciones": ["Sí", "No"]},
    {"etiqueta": "Respuesta automática del correo", "tipo": "lista", "requerido": true, "opciones": ["Sí, con el texto de abajo", "No, la configuro yo", "No hace falta"]},
    {"etiqueta": "Texto de la respuesta automática", "tipo": "parrafo", "requerido": false, "opciones": []},
    {"etiqueta": "Quién te cubre mientras tanto (mail)", "tipo": "texto", "requerido": false, "opciones": []}
  ]'::jsonb,
  '[
    "Configurar la respuesta automática del correo (si se pidió)",
    "[Ciberseguridad] Habilitar la VPN fuera de horario hasta la fecha de vuelta (si se pidió)",
    "[Ciberseguridad] Permitir los inicios de sesión desde el país de destino (acceso condicional)",
    "Verificar que la notebook tenga cifrado, antivirus y actualizaciones al día (si la lleva)"
  ]'::jsonb,
  'Antes de viajar: actualizá y reiniciá la notebook, y verificá que tengas la app Microsoft Authenticator en el celular.' || chr(10) ||
  'Durante el viaje: usá siempre la VPN en redes wifi públicas (aeropuertos, hoteles, bares), no dejes la notebook sola ni en el auto, y no la conectes a computadoras o cargadores USB que no sean tuyos.' || chr(10) ||
  'Si perdés la notebook o el celular, o te piden tu contraseña por mensaje o llamada, avisanos enseguida respondiendo este pedido.'
)
on conflict (nombre) do nothing;

-- El acceso solo se registra si en el pedido se pidió la VPN (si la respuesta es "No", no hay acceso que controlar).
-- Además usa el nombre del acceso de la categoría y suma el destino al detalle.
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
  if exists (select 1 from jsonb_array_elements(t.datos) x where x->>'etiqueta' ~* 'vpn' and x->>'valor' ~* '^\s*no\y') then return null; end if;

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
    v_persona := nullif(trim(both ' ,;:-<>()' from regexp_replace(v_persona, '<?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>?', '', 'g')), '');
  elsif v_persona is not null then
    if t.solicitante_nombre <> '' and (t.solicitante_nombre ilike v_persona || '%' or v_persona ilike t.solicitante_nombre || '%') then
      v_email := lower(t.solicitante_email); v_pid := t.solicitante_id;
    elsif t.beneficiario_nombre <> '' and (t.beneficiario_nombre ilike v_persona || '%' or v_persona ilike t.beneficiario_nombre || '%') then
      select email, id into v_email, v_pid from perfiles where id = t.beneficiario_id;
    else
      select lower(email), id into v_email, v_pid from perfiles where lower(nombre) = lower(trim(v_persona)) and activo limit 1;
    end if;
  end if;
  if v_pid is null and coalesce(v_email, '') <> '' then select id into v_pid from perfiles where lower(email) = v_email; end if;

  for d in select * from jsonb_array_elements(t.datos) loop
    if d->>'etiqueta' ~* 'duraci' and d->>'valor' ~* 'permanente' then v_permanente := true; end if;
    if v_hasta is null and d->>'etiqueta' ~* 'hasta' then v_hasta := tk_leer_fecha(d->>'valor'); end if;
  end loop;
  if v_permanente then v_hasta := null;
  elsif v_hasta is null and c.acceso_dias_max is not null then
    v_hasta := now() + make_interval(days => c.acceso_dias_max); v_estimada := true;
  end if;

  select coalesce(c.acceso_nombre, c.nombre) || coalesce(' · ' || string_agg(d3->>'valor', ' · '), '') into v_sistema
    from jsonb_array_elements(t.datos) d3
   where d3->>'etiqueta' ~* '(cuenta|ambiente|nivel|rol$|proyecto|grupo de seguridad|organizaci|equipos|sistemas o servidores|destino)'
     and coalesce(d3->>'valor', '') <> '';

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

-- ---------- Seguridad por fila ----------
alter table phishing_analisis enable row level security;
alter table politicas enable row level security;
alter table politica_aceptaciones enable row level security;

drop policy if exists phishing_analisis_leer on phishing_analisis;
create policy phishing_analisis_leer on phishing_analisis for select to authenticated using (tk_es_staff() and tk_ve_ticket(ticket_id));

drop policy if exists politicas_leer on politicas;
create policy politicas_leer on politicas for select to authenticated
  using (tk_es_staff() or (publicada and (alcance = 'todos' or tk_tipo() = 'interno')));

drop policy if exists politica_aceptaciones_leer on politica_aceptaciones;
create policy politica_aceptaciones_leer on politica_aceptaciones for select to authenticated
  using (perfil_id = auth.uid() or tk_es_staff());
