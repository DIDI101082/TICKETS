# Mesa de Ayuda

Sistema de tickets para usuarios internos y clientes externos. Next.js + Supabase + Vercel, con el look and feel de Accusys Cyber.

## Qué incluye

**Atención**
- Portal para cargar y seguir tickets, con adjuntos y encuesta de satisfacción al cierre.
- Bandeja de agentes con vistas (activos, míos, mis sectores, sin asignar, triage, incidentes, escalados), filtros por sector, organización, categoría y estado.
- Categorías con formulario propio: cada tipo de pedido pide sus datos, puede ir directo a un sector, exigir aprobación o ser confidencial.
- Respuestas predefinidas con variables (`{{nombre}}`, `{{numero}}`, `{{asunto}}`).
- Base de conocimiento con sugerencias mientras se escribe el ticket.

**Para quien carga pedidos**
- Inicio con buscador de ayuda, accesos directos a los tipos de pedido que más usa y aviso de problemas en curso.
- Etapas del pedido, fecha estimada de respuesta y aviso cuando se espera algo de la persona.
- Reabrir un pedido resuelto y cargar otro igual a uno anterior.
- Pedir en nombre de otra persona y sumar gente en copia.
- Borrador automático del formulario (se guarda en el navegador) y capturas de pantalla pegadas con Ctrl+V.
- Impacto y urgencia declarados por la persona, que proponen la prioridad.
- "Buscar una solución" antes de enviar: responde con los artículos de ayuda (con IA si está configurada).
- Campanita de novedades, preferencias de aviso por mail y aprobación de pedidos desde el mail, sin ingresar.
- Estado de los servicios y voto "¿te sirvió?" en cada artículo.
- Resumen mensual por mail para el referente de cada organización.

**IA** (requiere `ANTHROPIC_API_KEY`)
- Derivación automática a sector y prioridad; con poca confianza el ticket queda en Triage.
- Borrador de respuesta a partir del hilo y de los artículos de ayuda. El agente siempre lo revisa: nunca se envía solo.
- Resumen del ticket en tres líneas (problema, hecho, pendiente).

**Operación**
- SLA de respuesta y resolución por prioridad, en horario de atención y con feriados, pausado mientras el ticket está En espera.
- Escalamiento al responsable del sector cuando vence el SLA o nadie toma el ticket.
- Detección de posibles incidentes: varios tickets parecidos del mismo sector en poco tiempo.
- Tickets vinculados a uno principal (se resuelven juntos) y fusión de duplicados.
- Aprobaciones: un responsable aprueba o rechaza el pedido antes de ejecutarlo.
- Tickets programados que se crean solos (diario, semanal, mensual).
- Tickets parecidos ya resueltos e historial por equipo (n.º de inventario).

**Clientes y control**
- Organizaciones: los usuarios se agrupan por empresa (automático por dominio del mail). Un "referente" ve todos los tickets de su organización.
- Restricción por sector (opcional) y tickets confidenciales con acceso por persona.
- Auditoría: quién cambió qué y quién abrió cada ticket, con exportación.
- Tablero, reportes por período (por mes, sector, organización, categoría y agente) y exportación a CSV.

**Integraciones**
- Entrada por email y Teams (webhook), avisos a Teams y por mail.
- Monitoreo (PRTG): una caída abre un ticket y la recuperación lo resuelve.
- Contadores para mostrar en otra app, por ejemplo Accusys Cyber.

## Puesta en marcha

### 1. Supabase

1. Crear un proyecto.
2. **SQL Editor** → ejecutar, en este orden: `supabase/schema.sql`, `002_ampliacion.sql`, `003_formularios.sql` (formularios de pedidos frecuentes, opcional) y `004_portal.sql`. Todos se pueden correr más de una vez.
3. **Authentication → URL Configuration**: *Site URL* con la dirección de la app y `https://TU-APP/auth/callback` en *Redirect URLs*.
4. (Opcional) **Authentication → Providers → Azure** para el ingreso con Microsoft, y `NEXT_PUBLIC_MICROSOFT=1` en Vercel.

### 2. GitHub y Vercel

Subir el contenido de esta carpeta a un repo, importarlo en Vercel y cargar las variables de `.env.example`. Las tres de Supabase son obligatorias; las `NEXT_PUBLIC_...` van como tipo "Config" y las claves como "Secret".

### 3. Primer ingreso

**La primera cuenta que se registra queda como administrador.** El resto entra como usuario externo y se le cambia el rol en Administración → Personas.

### Actualizar una instalación existente

Siempre en este orden: **primero** ejecutar el SQL nuevo en Supabase, **después** subir el código. Al revés, la app queda con errores hasta que se ejecute el SQL.

## Roles y visibilidad

| Quién | Qué ve |
| --- | --- |
| Usuario | Sus tickets. Si es referente, también los de su organización (no los confidenciales) |
| Aprobador | Además, los tickets que le pidieron aprobar |
| Agente | Todos los tickets no confidenciales; con la restricción por sector activada, solo los de sus sectores, los que tiene asignados y el triage |
| Administrador | Todo |

Un ticket confidencial lo ven solo el solicitante, quien lo tiene asignado, las personas agregadas a mano y los administradores. La restricción por sector se activa en Administración → General → Reglas automáticas; antes conviene asignar sectores a cada agente.

Estas reglas están en la base (Row Level Security, función `tk_ve_ticket`), no solo en las pantallas.

## SLA

- Tiempos por prioridad, en minutos de atención.
- Con el horario de atención activado (Administración → General) solo cuenta el tiempo dentro de los días y horas definidos, salteando feriados. Desactivado, corre 24×7.
- Al cambiar tiempos, horario o feriados se recalculan los tickets activos.
- Los avisos, el escalamiento y los programados corren con el cron de `vercel.json` (una vez por día en el plan Hobby) y además cada vez que alguien abre la bandeja, como mucho cada 10 minutos. En un plan Pro conviene poner el cron en `*/15 * * * *`.

## Email y Teams

Los dos canales entran por el mismo webhook:

```
POST https://TU-APP/api/entrada
x-entrada-secret: <ENTRADA_SECRET>
Content-Type: application/json

{ "canal": "email", "de": "persona@dominio.com", "nombre": "Nombre Apellido", "asunto": "No anda la VPN", "cuerpo": "Texto del pedido" }
```

- **Email con Power Automate**: disparador *Cuando llega un nuevo correo (V3)* sobre la casilla de soporte → acción *HTTP* (POST) con ese cuerpo. Si el asunto trae `[#1234]` y escribe el solicitante, se agrega como respuesta.
- **Tickets desde Teams**: disparador *Cuando se publica un mensaje en un canal* → la misma acción con `"canal": "teams"`.
- **Avisos a Teams**: URL de un flujo *Publicar en un canal cuando se recibe una solicitud de webhook* en `TEAMS_WEBHOOK_URL`.
- **Avisos por mail**: `RESEND_API_KEY` y `EMAIL_FROM`. Cada persona elige en "Mi cuenta" si quiere mail por cada novedad, solo al resolverse o ninguno.
- **Avisos por Teams a cada persona**: `TEAMS_USUARIO_WEBHOOK_URL` con la dirección de un flujo *Cuando se recibe una solicitud HTTP* → *Publicar mensaje en un chat o canal* (Flow bot, destinatario = `email`). El flujo recibe `{ email, titulo, texto, url }`.

## Monitoreo (PRTG)

```
POST https://TU-APP/api/monitoreo?secret=<MONITOREO_SECRET>
dispositivo=%device&sensor=%name&estado=%status&mensaje=%message
```

En PRTG: Configuración → Plantillas de notificación → *Ejecutar acción HTTP*, método POST, con esa URL y esos datos. Usar la misma plantilla para el disparador de caída y el de recuperación.

- Estado caído (Down, Fallo, Error) → abre un ticket de prioridad alta en `MONITOREO_SECTOR`. Si ya hay uno abierto para ese dispositivo y sensor, agrega una nota.
- Estado normal (Up, OK, Disponible) → agrega la nota y marca el ticket como resuelto.

## Contadores para otra app

```
GET https://TU-APP/api/resumen
x-api-key: <RESUMEN_API_KEY>
```

Devuelve abiertos, en curso, en espera, sin asignar, en triage, SLA vencido, antigüedad del más viejo y activos por sector. Solo cantidades: nunca asuntos ni datos de personas. Para mostrarlos en Accusys Cyber hay que agregar ahí una pantalla que consulte esta dirección desde el servidor.

## Seguridad

- Las lecturas pasan por Row Level Security; las escrituras las hace el servidor con la service role key después de validar permisos.
- Adjuntos en un bucket privado, con enlaces firmados de 60 segundos.
- La entrada por email confía en el remitente que informa el flujo: un remitente falsificado podría crear tickets a nombre de otro, pero no leer nada.
- Los avisos a Teams no muestran el asunto de los tickets confidenciales.

## Límites conocidos

- El borrador del formulario vive en el navegador: no pasa de una computadora a otra y no guarda los adjuntos.
- "Pedir para otro" y "en copia" solo vinculan a personas que ya tienen cuenta.
- El enlace de aprobación del mail funciona sin iniciar sesión: quien lo tenga puede decidir. Es de un solo uso.
- El estado de los servicios se actualiza a mano; no se conecta con el monitoreo.
- El resumen mensual y los avisos por mail necesitan `RESEND_API_KEY`.

- Adjuntos: hasta 5 archivos y 4 MB por envío. Los de los mails entrantes no se guardan.
- "Tickets parecidos" e "incidentes" comparan palabras del asunto; no entienden sinónimos.
- El equipo de un ticket es un texto (n.º de inventario): no consulta el inventario de Cyber.
- El reporte se imprime o guarda como PDF desde el navegador.
- El triage lo ven todos los agentes aunque esté activada la restricción por sector.

## Desarrollo local

```
cp .env.example .env.local   # completar
npm install
npm run dev
```
