# FASE 2 — API base

Esta fase implementa la API, no las pantallas de login o catálogo. El frontend
sigue mostrando el título. Las pruebas manuales están en `docs/api.http` (REST
Client de VS Code), y también se puede usar PowerShell, curl o Postman.

## Actualizar desde FASE 1 sin perder datos

Trabajar en una rama nueva y copiar los archivos actualizados sin reemplazar `.env`.
Antes de cualquier comando Compose, agregar `JWT_SECRET`: Compose lo necesita
incluso para comandos de parada. Este bloque PowerShell crea 48 bytes aleatorios y
los guarda localmente **sin imprimir el secreto**; conserva uno existente no vacío:

```powershell
if (!(Test-Path .env)) { throw 'Primero copia .env.example a .env y completa las claves de las bases.' }
$contenidoApi = [IO.File]::ReadAllText((Join-Path (Get-Location) '.env'))
if ($contenidoApi -notmatch '(?m)^JWT_SECRET=\S+') {
    $bytesJwt = New-Object byte[] 48
    $generadorJwt = [Security.Cryptography.RandomNumberGenerator]::Create()
    $generadorJwt.GetBytes($bytesJwt)
    $generadorJwt.Dispose()
    $lineaJwt = 'JWT_SECRET=' + [Convert]::ToBase64String($bytesJwt)
    $contenidoApi = [regex]::Replace($contenidoApi, '(?m)^JWT_SECRET=.*\r?\n?', '')
    [IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $contenidoApi.TrimEnd() + "`r`n" + $lineaJwt + "`r`n")
}
```

Conservar las contraseñas actuales y los puertos que funcionaban:

```dotenv
ORACLE_HOST_PORT=1523
MONGO_HOST_PORT=27018
```

Aplicar **solo** la migración 07. No ejecutar el legacy ni `down -v`:

```powershell
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-api.sh
docker compose up -d --build api
docker compose up -d
docker compose ps
```

`07-api.sql` es idempotente. Crea secuencias de productos y empleados a partir del
máximo actual únicamente cuando todavía no existen, y agrega Usuario.token_version
con cero para los usuarios existentes. Repetirla no reinicia secuencias ni borra
usuarios o ventas. La API verifica esta migración al arrancar y muestra un error
explícito si falta. En una instalación completamente nueva, `00-inicializar.sh`
ejecuta automáticamente 01–07. No ejecutar manualmente 01–06 sobre datos existentes.

## Prueba rápida desde PowerShell

Después de arrancar, copiar el bloque siguiente. No imprime el JWT; lo usa solo
en memoria para consultar el usuario actual y el catálogo:

```powershell
$datosLogin = @{ email = 'admin@demo.gasalpaso.test'; password = 'GasPasoDemo2026!' } | ConvertTo-Json
$sesionApi = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/auth/login' -ContentType 'application/json' -Body $datosLogin
$cabeceraApi = @{ Authorization = "Bearer $($sesionApi.token)" }
Invoke-RestMethod -Uri 'http://localhost:4000/api/auth/me' -Headers $cabeceraApi
Invoke-RestMethod -Uri 'http://localhost:4000/api/catalogo'
```

Para probar los otros roles, cambiar el email por `ana@demo.gasalpaso.test` o
`camila@demo.gasalpaso.test`. La contraseña demo es la misma. No confundirla con las
claves de Oracle, Mongo o JWT. Las credenciales demo son públicas y solo para desarrollo.

Para el CRUD completo, abrir `docs/api.http`, instalar la extensión **REST Client**
y pulsar **Send Request** sobre loginAdmin. Después ejecutar crearProducto,
edición, PATCH y baja en orden: las variables toman token e ID de las respuestas.
Cambiar los emails de ejemplo si ya se crearon; un duplicado devuelve 409.

## Endpoints y autorización

Todas las rutas empiezan en `/api`, reciben/devuelven JSON. Las listas aceptan
`limite` (hasta 100) y `offset`; valores predeterminados 50 y 0. Catálogo y usuarios
usan esa paginación; repartidores devuelve las coberturas de los repartidores activos.

| Método y ruta | Acceso | Comportamiento |
| --- | --- | --- |
| `GET /health` | Público | Consulta real a ambas bases. |
| `POST /auth/login` | Público | Email/password; token JWT de una hora y usuario sin hash. |
| `POST /auth/registro` | Público | Crea Cliente y Usuario CLIENTE en una transacción. No admite rol ni IDs internos. |
| `GET /auth/me` | Autenticado | Usuario vigente de Oracle. |
| `GET /catalogo` | Público | Mongo para contenido, Oracle para precio, stock, peso, nombre y activo. |
| `GET /catalogo/:id` | Público | Detalle; inactivos devuelven 404. |
| `POST /catalogo` | ADMIN | Crea producto Oracle y contenido Mongo; HTTP 201. |
| `PUT /catalogo/:id` | ADMIN | Edición parcial de campos permitidos. |
| `DELETE /catalogo/:id` | ADMIN | Baja lógica en ambas bases, sin borrar ventas históricas. |
| `PATCH /productos/:id` | ADMIN | Solo precio, stock y activo, con Oracle como fuente de verdad. |
| `GET /comunas` | Público | Comunas disponibles para registro. |
| `GET /usuarios` | ADMIN | Lista sin password_hash ni token_version. |
| `POST /usuarios` | ADMIN | Crea ADMIN, REPARTIDOR o CLIENTE y su registro relacionado. |
| `PATCH /usuarios/:id` | ADMIN | Email, nombre, contraseña, activo, rol compatible y datos del cliente. |
| `GET /repartidores?comuna=1` | ADMIN | Devuelve primero quienes cubren la comuna; incluye el resto como alternativas. |
| `PUT /repartidores/:id/comunas` | ADMIN | Reemplaza cobertura completa; `id` es de empleado. |
| `GET /auditoria?tipo=CAMBIO_PRECIO` | ADMIN | Eventos con paginación; se puede filtrar por tipo. |
| `POST /sincronizacion/reintentar` | ADMIN | Intenta procesar la cola durable y devuelve cantidad pendiente. |

`?incluir_inactivos=true` en catálogo o detalle exige ADMIN; sin ese parámetro
la lectura es pública y filtra ambos estados activos. Una baja se puede revertir
con PATCH de `activo: true`. No se eliminan físicamente Productos porque existen
referencias desde ventas y cierres.

## Validación y datos

- Altas de productos requieren nombre (hasta 50), descripción (hasta 100), categoría
  GAS/ACCESORIO, peso positivo con dos decimales, precio entero CLP positivo y stock
  entero no negativo. Imagen es opcional; se genera un SVG propio predeterminado.
  `atributos` es un objeto JSON de hasta 10 KB, `activo`/`destacado` son booleanos.
- Precio acepta como máximo 99.999.999 CLP para respetar NUMBER(10,2).
- Los campos desconocidos se rechazan para impedir asignación masiva de roles o IDs.
- Registro CLIENTE requiere nombre, email, password, teléfono, dirección principal e id_comuna.
- Altas ADMIN/REPARTIDOR crean un Empleado de la sucursal 1; cobertura opcional solo
  para REPARTIDOR. Altas CLIENTE crean Cliente. No se enlazan IDs arbitrarios del cliente.
- PATCH permite cambiar ADMIN ↔ REPARTIDOR, conservando el empleado. No convierte
  clientes en empleados ni al revés; esa operación requiere un flujo separado.
  Un repartidor convertido en ADMIN pierde su cobertura.
- No se puede desactivar ni degradar al último ADMIN activo; el chequeo está serializado
  en Oracle. Desactivación es lógica: no hay DELETE de usuarios.
- Cobertura no admite IDs repetidos. Un ID de comuna inexistente revierte todo el
  reemplazo, conservando la cobertura anterior.

## Autenticación y errores

JWT HS256, issuer/audience fijos, expiración de una hora y secreto de al menos
32 bytes, exclusivamente en `.env`. No hay contraseña o secreto JWT de respaldo
incluido en el código. Las contraseñas nuevas tienen mínimo 8 caracteres y máximo
72 bytes UTF-8 por el límite de bcrypt; se guardan con costo 12.

Enviar `Authorization: Bearer TOKEN`. En cada petición protegida se consulta
Oracle para confirmar usuario activo, rol y versión del token. Cambiar contraseña,
rol o estado activo incrementa token_version y revoca sesiones anteriores, incluso
si luego se reactiva al usuario. No hay refresh token ni endpoint de logout en
esta fase: se inicia sesión nuevamente al expirar.

Errores centralizados con `{ "mensaje": "..." }` en español: 400 validación,
401 sesión/credenciales inválidas, 403 rol sin permiso, 404 inexistente/inactivo,
409 duplicado o conflicto, 413 tamaño excesivo, 503 base no disponible y 500 para
fallos internos. Nunca devolver stack, SQL, hashes o claves. Los logs registran
códigos, no cuerpos, tokens o cadenas de conexión. Consultas Oracle con binds;
columnas dinámicas salen de listas fijas, no de nombres enviados por el cliente.

## Oracle primero, Mongo después

Las mutaciones Oracle y sus filas Pendiente_Mongo se confirman juntas. Los cambios
reales de precio y stock generan eventos independientes CAMBIO_PRECIO/CAMBIO_STOCK
con antes/después y usuario. También se auditan los valores iniciales al crear un
producto, y las ediciones de contenido/activo. Se conserva el trigger legacy de
Auditoria_Precio como historial relacional adicional.

Después del commit, el sincronizador aplica contenido de catálogo y auditoría a
Mongo. Usa upsert y un `_id` estable `oracle-ID_EVENTO` para evitar auditoría duplicada.
Procesa FIFO, con bloqueo Oracle del primer pendiente (NOWAIT) y hasta 25 eventos
por ejecución; no adelanta una edición nueva si una antigua falló. Reintenta cada
5 segundos y al terminar cada mutación. Un error incrementa intentos, conserva un
código de error y deja el evento pendiente. No reabre ni revierte el commit anterior.

Las respuestas de mutación indican `sincronizacion: "OK"` o `"PENDIENTE"`. Un alta
confirmada puede devolver HTTP 201 con PENDIENTE aunque Mongo esté caído. La lectura
pública del catálogo requiere ambas bases; el cambio aparecerá cuando se aplique
la cola. PUT/DELETE de catálogo necesitan leer el documento previo de Mongo; si
esa lectura inicial falla, no comienzan una escritura Oracle. PATCH de precio/stock
no requiere esa lectura y mantiene su auditoría pendiente si Mongo no responde.

No hay transacción distribuida. El orden FIFO prioriza consistencia; un evento
permanentemente inválido bloquea los posteriores y requiere revisar ultimo_error,
corregir su causa y reintentar. No se descartan eventos automáticamente.

## Pruebas funcionales

Ejecutar en una base demo, no de producción. La suite crea usuarios de prueba,
registra auditoría y deja productos de prueba dados de baja para conservar historia.
No cambia las contraseñas demo ni elimina ventas. Puede repetirse con emails nuevos
que genera automáticamente. No ejecutar a la vez que se cambian las cuentas demo.

PowerShell:

```powershell
Get-Content -Raw api/tests/api.mjs | docker compose exec -T api node --input-type=module
```

Bash:

```sh
docker compose exec -T api node --input-type=module < api/tests/api.mjs
```

## Resultados verificados

- Actualización aditiva sobre las bases de FASE 1, sin borrar sus volúmenes.
- Instalación independiente desde cero con scripts 01–07 y cuatro servicios healthy.
- Migración 07 ejecutada nuevamente sin errores ni reinicio de secuencias.
- **98 comprobaciones API aprobadas**: tres roles, JWT vencido/algoritmo/rol inválidos,
  autorización, registro, rollback de duplicados y comunas inválidas, catálogo CRUD,
  baja/reactivación, auditoría exacta de precio/stock y revocación de sesiones.
- **36 comprobaciones Oracle de FASE 1 aprobadas** después de agregar la migración.
- Mongo detenido durante un alta: HTTP 201 con sincronizacion PENDIENTE; el producto
  permaneció en Oracle. Tras restaurar Mongo se recuperaron el catálogo y exactamente
  sus dos eventos de auditoría, sin duplicados.

Las pruebas se ejecutaron con Oracle y Mongo reales en proyectos Docker aislados,
con la CA del proxy como secreto de BuildKit. No se usaron mocks ni se borraron los
datos del proyecto original. SQL Developer/Compass y REST Client en el PC del
usuario requieren sus pruebas locales según las instrucciones anteriores.
