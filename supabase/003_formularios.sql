-- ============================================================
-- Mesa de Ayuda — formularios de pedidos frecuentes
-- Requiere schema.sql y 002_ampliacion.sql. Se puede correr más de una vez:
-- si la categoría ya existe, actualiza su formulario.
-- ============================================================

-- Sectores que usan estos formularios (no hace nada si ya existen)
insert into sectores (nombre, descripcion, orden) values
  ('Ciberseguridad', 'Seguridad de la información: phishing y mails sospechosos, malware o alertas del antivirus, incidentes de seguridad, accesos indebidos, MFA, VPN, revisión de permisos, vulnerabilidades y pedidos de excepción a políticas de seguridad.', 5),
  ('SRE', 'Todo lo que corre en la nube, por ejemplo AWS: cuentas y permisos cloud (IAM), instancias, contenedores, bases de datos gestionadas, almacenamiento, redes cloud, despliegues y pipelines, monitoreo, disponibilidad y costos.', 6),
  ('Plataforma Core', 'Plataforma Core: fallas, errores o comportamiento inesperado del producto Core, configuración y parametrización, ambientes, versiones y consultas funcionales o técnicas sobre la plataforma.', 7)
on conflict (nombre) do nothing;

create or replace function pg_temp.sec(n text) returns uuid language sql as $$ select id from public.sectores where nombre = n $$;
-- Arma un campo del formulario: etiqueta, tipo (texto | parrafo | lista), obligatorio y opciones
create or replace function pg_temp.c(etiqueta text, tipo text, requerido boolean, variadic opciones text[] default '{}') returns jsonb
language sql as $$ select jsonb_build_object('etiqueta', etiqueta, 'tipo', tipo, 'requerido', requerido, 'opciones', to_jsonb(opciones)) $$;

insert into categorias (nombre, descripcion, sector_id, prioridad, requiere_aprobacion, confidencial, orden, campos) values

('Armado de servidor', 'Pedido de un servidor nuevo, físico, virtual o en la nube', pg_temp.sec('Infraestructura'), null, true, false, 10, jsonb_build_array(
  pg_temp.c('Nombre del servidor (hostname)', 'texto', true),
  pg_temp.c('Dónde se arma', 'lista', true, 'Servidor local (on-premise)', 'AWS', 'A definir'),
  pg_temp.c('Ambiente', 'lista', true, 'Producción', 'Homologación', 'Testing', 'Desarrollo'),
  pg_temp.c('Sistema operativo y versión', 'texto', true),
  pg_temp.c('Procesador (cantidad de vCPU)', 'texto', true),
  pg_temp.c('Memoria RAM (GB)', 'texto', true),
  pg_temp.c('Discos (tamaño en GB y uso de cada uno)', 'texto', true),
  pg_temp.c('Red: IP fija, puertos a abrir y desde dónde se accede', 'parrafo', false),
  pg_temp.c('Software a instalar', 'parrafo', false),
  pg_temp.c('Personas que necesitan acceso y con qué permiso', 'parrafo', true),
  pg_temp.c('Backup', 'lista', true, 'Diario', 'Semanal', 'No requiere'),
  pg_temp.c('Fecha en que se necesita', 'texto', true)
)),

('Acceso a VPN fuera del horario habitual', 'Habilitar la VPN en días u horarios en los que normalmente está cerrada', pg_temp.sec('Ciberseguridad'), null, true, false, 11, jsonb_build_array(
  pg_temp.c('Persona que necesita el acceso', 'texto', true),
  pg_temp.c('Desde (fecha y hora)', 'texto', true),
  pg_temp.c('Hasta (fecha y hora)', 'texto', true),
  pg_temp.c('Se repite', 'lista', true, 'Una sola vez', 'Todos los días del período', 'Solo fines de semana y feriados'),
  pg_temp.c('Motivo', 'parrafo', true),
  pg_temp.c('Sistemas o servidores a los que necesita llegar', 'parrafo', true),
  pg_temp.c('Equipo desde el que se conecta', 'lista', true, 'Notebook de la empresa', 'Equipo personal'),
  pg_temp.c('Responsable que autoriza', 'texto', true)
)),

('Alta de usuario', 'Ingreso de una persona nueva: cuenta, equipo y accesos', pg_temp.sec('CAU'), null, true, false, 12, jsonb_build_array(
  pg_temp.c('Nombre y apellido', 'texto', true),
  pg_temp.c('Puesto', 'texto', true),
  pg_temp.c('Área', 'texto', true),
  pg_temp.c('Jefe directo', 'texto', true),
  pg_temp.c('Fecha de ingreso', 'texto', true),
  pg_temp.c('Tipo de vínculo', 'lista', true, 'Empleado', 'Contratista', 'Pasante'),
  pg_temp.c('Modalidad', 'lista', true, 'Presencial', 'Híbrido', 'Remoto'),
  pg_temp.c('Oficina', 'texto', false),
  pg_temp.c('Equipo que necesita', 'lista', true, 'Notebook', 'PC de escritorio', 'Ninguno'),
  pg_temp.c('Licencias y programas', 'parrafo', false),
  pg_temp.c('Sistemas a los que necesita acceso y con qué permiso', 'parrafo', true),
  pg_temp.c('Grupos de correo y de Teams', 'parrafo', false)
)),

('Baja de usuario', 'Egreso de una persona: cierre de cuenta, accesos y devolución de equipos', pg_temp.sec('CAU'), null, true, true, 13, jsonb_build_array(
  pg_temp.c('Nombre y apellido', 'texto', true),
  pg_temp.c('Usuario o mail', 'texto', true),
  pg_temp.c('Área', 'texto', true),
  pg_temp.c('Último día de trabajo', 'texto', true),
  pg_temp.c('Fecha y hora en que se deshabilita la cuenta', 'texto', true),
  pg_temp.c('Qué hacer con el correo', 'lista', true, 'Reenviar a otra persona', 'Convertir en buzón compartido', 'Eliminar'),
  pg_temp.c('A quién se reenvía o delega el correo', 'texto', false),
  pg_temp.c('A quién se transfieren los archivos (OneDrive y carpetas)', 'texto', false),
  pg_temp.c('Equipos a devolver', 'parrafo', false),
  pg_temp.c('Accesos a otros sistemas que hay que revocar', 'parrafo', false),
  pg_temp.c('Observaciones', 'parrafo', false)
)),

('Modificación de usuario', 'Cambio de datos, permisos, licencias o grupos de una cuenta existente', pg_temp.sec('CAU'), null, false, false, 14, jsonb_build_array(
  pg_temp.c('Usuario o mail', 'texto', true),
  pg_temp.c('Qué hay que modificar', 'lista', true, 'Datos (nombre, puesto, teléfono)', 'Permisos sobre un sistema', 'Licencias', 'Grupos de correo o de Teams', 'Otro'),
  pg_temp.c('Detalle del cambio', 'parrafo', true),
  pg_temp.c('Desde cuándo', 'texto', false)
)),

('Cambio de área', 'Una persona pasa a otra área: se ajustan accesos, grupos y equipo', pg_temp.sec('CAU'), null, true, false, 15, jsonb_build_array(
  pg_temp.c('Nombre y apellido', 'texto', true),
  pg_temp.c('Área actual', 'texto', true),
  pg_temp.c('Área nueva', 'texto', true),
  pg_temp.c('Nuevo jefe directo', 'texto', true),
  pg_temp.c('Fecha del cambio', 'texto', true),
  pg_temp.c('Accesos que hay que quitar', 'parrafo', true),
  pg_temp.c('Accesos que hay que agregar', 'parrafo', true),
  pg_temp.c('Grupos de correo y de Teams', 'parrafo', false),
  pg_temp.c('¿Cambia de equipo u oficina?', 'texto', false)
)),

('Permisos en AWS', 'Acceso o cambio de permisos sobre una cuenta de AWS', pg_temp.sec('SRE'), null, true, false, 16, jsonb_build_array(
  pg_temp.c('Persona que necesita el acceso', 'texto', true),
  pg_temp.c('Cuenta de AWS', 'texto', true),
  pg_temp.c('Ambiente', 'lista', true, 'Producción', 'Homologación', 'Testing', 'Desarrollo'),
  pg_temp.c('Tipo de acceso', 'lista', true, 'Consola', 'Programático (claves de acceso)', 'Consola y programático'),
  pg_temp.c('Nivel de permiso', 'lista', true, 'Solo lectura', 'Desarrollador (sin administrar usuarios)', 'Administrador', 'Facturación y costos', 'Personalizado'),
  pg_temp.c('Servicios (EC2, S3, RDS, Lambda, etc.)', 'texto', true),
  pg_temp.c('Recursos puntuales (buckets, instancias, bases)', 'parrafo', false),
  pg_temp.c('Duración', 'lista', true, 'Permanente', 'Temporal'),
  pg_temp.c('Si es temporal, hasta cuándo', 'texto', false),
  pg_temp.c('Para qué lo necesita', 'parrafo', true)
)),

('Permisos en Azure DevOps', 'Acceso a proyectos, repositorios o pipelines de Azure DevOps', pg_temp.sec('SRE'), null, true, false, 17, jsonb_build_array(
  pg_temp.c('Persona que necesita el acceso', 'texto', true),
  pg_temp.c('Organización', 'texto', true),
  pg_temp.c('Proyecto', 'texto', true),
  pg_temp.c('Nivel de acceso', 'lista', true, 'Stakeholder', 'Basic', 'Basic + Test Plans'),
  pg_temp.c('Grupo de seguridad', 'lista', true, 'Readers', 'Contributors', 'Build Administrators', 'Project Administrators'),
  pg_temp.c('Repositorios', 'texto', false),
  pg_temp.c('Pipelines', 'lista', true, 'No necesita', 'Ver', 'Ejecutar', 'Crear y editar'),
  pg_temp.c('Duración', 'lista', true, 'Permanente', 'Temporal'),
  pg_temp.c('Si es temporal, hasta cuándo', 'texto', false),
  pg_temp.c('Para qué lo necesita', 'parrafo', true)
)),

('Permisos en Sentry', 'Acceso a proyectos o equipos de Sentry', pg_temp.sec('SRE'), null, true, false, 18, jsonb_build_array(
  pg_temp.c('Persona que necesita el acceso', 'texto', true),
  pg_temp.c('Organización', 'texto', false),
  pg_temp.c('Equipos', 'texto', true),
  pg_temp.c('Proyectos', 'texto', true),
  pg_temp.c('Rol', 'lista', true, 'Member', 'Admin', 'Manager', 'Owner', 'Billing'),
  pg_temp.c('Para qué lo necesita', 'parrafo', true)
))

on conflict (nombre) do update set
  descripcion = excluded.descripcion,
  sector_id = excluded.sector_id,
  requiere_aprobacion = excluded.requiere_aprobacion,
  confidencial = excluded.confidencial,
  orden = excluded.orden,
  campos = excluded.campos;
