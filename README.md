# Gas al Paso — FASE 6: frontend REPARTIDOR

Proyecto académico de venta y reparto de gas. Infraestructura con React + Vite,
Node.js + Express, Oracle Free (driver thin) y MongoDB 7. La API implementa login, JWT/roles, catálogo, administración, carrito, pedidos, tarreo, cargas, cierre y cuadratura diaria.
El frontend incluye el flujo CLIENTE y la jornada del REPARTIDOR: pedidos, entrega/cobro,
venta de calle, ventas del día y cierre. Las pantallas de ADMIN quedan para FASE 7.

## Actualizar desde FASE 5 (sin borrar datos)

Seguir [FASE 6: actualización y jornada desde el celular](docs/FASE-6.md).
Conservar `.env`, JWT_SECRET y puertos; reconstruir API y frontend con
`docker compose up -d --build`. Esta fase no agrega migraciones. **No usar `down -v`.**
Si falta FASE 4, aplicar primero [su migración](docs/FASE-4.md).
El cliente entra en http://localhost:3000; el repartidor inicia sesión y accede a
`/repartidor/pedidos`. La guía incluye cómo preparar una jornada con cuentas de prueba
nuevas, sin depender de cuentas demo que ya tengan un cierre definitivo.

## Descargar y abrir en VS Code

1. Instalar y abrir Docker Desktop. Para trabajar solo con Docker no se necesita Node local.
2. Descargar el proyecto, descomprimir y abrir en VS Code la carpeta que contiene `docker-compose.yml`.
3. Abrir **Terminal → Nueva terminal** en esa carpeta (no dentro de `api` ni `frontend`).
4. Copiar `.env.example` a `.env` y completar `ORACLE_PASSWORD`, `APP_USER_PASSWORD` y `MONGO_INITDB_ROOT_PASSWORD` con contraseñas locales fuertes y distintas. Mantener `APP_USER=gas_app` y `MONGO_INITDB_ROOT_USERNAME=gas_admin`, salvo que se quieran personalizar los usuarios. El nombre de usuario Oracle admite letras, números y guion bajo, empezando por letra; su contraseña no debe contener comillas dobles ni saltos de línea (limitación del arranque SQLPlus).
5. Generar `JWT_SECRET` aleatorio de al menos 32 bytes en `.env`, usando el bloque PowerShell de [FASE 2](docs/FASE-2.md). No compartirlo ni subirlo a Git.
6. Los puertos externos predeterminados son Oracle **1522** y Mongo **27017**. Si están ocupados en tu PC, cambiar en `.env`:

```dotenv
ORACLE_HOST_PORT=1523
MONGO_HOST_PORT=27018
```

No cambiar `oracle:1521/FREEPDB1` ni `mongo:27017` en la API: son direcciones internas.
No escribir contraseñas reales en Compose ni subir `.env` a Git.

## Inicializar desde cero

Para una instalación nueva, los scripts se ejecutan automáticamente **solo al crear volúmenes nuevos**. Completar también JWT_SECRET antes de ejecutar Compose.
Para pasar del esquema vacío de FASE 0 a FASE 1 se necesita reinicializar las bases.
**El siguiente `down -v` elimina todos los datos de este proyecto. Respaldar antes
cualquier dato que se quiera conservar.** Ejecutar únicamente desde la carpeta correcta:

```sh
docker compose down -v
docker compose up -d --build
docker compose ps
```

En una instalación nueva basta con `docker compose up -d --build`. Oracle puede
tardar varios minutos. Los cuatro servicios deben quedar `healthy`; Oracle no
se marca listo hasta completar y verificar todas las migraciones.

Abrir en el navegador:

- `http://localhost:3000`: título Gas al Paso.
- `http://localhost:4000/api/health`: HTTP 200 con `oracle` y `mongo` en `OK`.

```json
{"estado":"OK","oracle":"OK","mongo":"OK","mensaje":"Oracle y MongoDB disponibles."}
```

Para ver errores de arranque:

```sh
docker compose logs --tail=150 oracle mongo api frontend
```

Si falla una migración en el primer inicio, el contenedor puede reiniciar con la
base parcialmente creada. No confundir `DATABASE IS READY` del motor con la salud
de esta aplicación: revisar los logs de la primera ejecución, corregir la causa y
reinicializar los volúmenes de desarrollo. No ejecutar el legacy sobre datos reales.

## Conectar SQL Developer

Crear una conexión de tipo **Básico**:

| Campo | Valor |
| --- | --- |
| Usuario | `gas_app` (o `APP_USER` de `.env`) |
| Contraseña | El valor de `APP_USER_PASSWORD` de tu `.env` |
| Rol | Predeterminado, **no SYSDBA** |
| Host | `localhost` |
| Puerto | `1522` o el valor de `ORACLE_HOST_PORT` si lo cambiaste |
| Tipo | Nombre de servicio |
| Servicio | `FREEPDB1` |

Seleccionar **Probar** y luego **Conectar**. Consultas de comprobación:

```sql
SELECT * FROM Comuna ORDER BY id_comuna;
SELECT email, rol, activo FROM Usuario ORDER BY id_usuario;
SELECT id_producto, nombre, valor_unitario, stock, activo FROM Productos ORDER BY id_producto;
SELECT id_venta, canal, estado_pago, subtotal, descuento, total_venta FROM Venta ORDER BY id_venta;
SELECT * FROM V_Cuadratura_Dinero;
SELECT * FROM V_Cuadratura_Stock;
SELECT object_name, object_type FROM user_objects WHERE status = 'INVALID';
```

Resultados iniciales: una tienda, tres empleados, ocho comunas, tres clientes,
seis usuarios, seis productos, tres ventas y ningún objeto inválido.

## Conectar MongoDB Compass

Crear una conexión con URI **sin contraseña incrustada**:

```text
mongodb://localhost:27017/?authSource=admin
```

Si cambiaste `MONGO_HOST_PORT`, usar ese puerto (por ejemplo `27018`). En las
opciones de autenticación seleccionar **Username / Password**, usuario
`gas_admin` (o `MONGO_INITDB_ROOT_USERNAME`), contraseña de
`MONGO_INITDB_ROOT_PASSWORD` y base de autenticación **admin**.

Conectar y abrir `gas_al_paso`: deben existir `catalogo` (6), `pedidos` (2),
`carritos` (1 inicialmente, expira a los 30 minutos) y `eventos_auditoria` (1).
En **Indexes** de `carritos` aparece `ttl_carrito`, con `expireAfterSeconds: 0`.
El borrado TTL es asíncrono: puede tardar alrededor de un minuto después de expirar.

## Cuentas ficticias de desarrollo

**Estas credenciales son públicas, solo para desarrollo y nunca para producción.**
Todas usan la contraseña ficticia **`GasPasoDemo2026!`**. En Oracle solo se guardan
hashes bcrypt distintos, con costo 12. Son usuarios de la aplicación, no usuarios
para SQL Developer ni Compass. El login funciona en http://localhost:3000/login y mediante `POST /api/auth/login`.

| Email | Rol | Vínculo |
| --- | --- | --- |
| `admin@demo.gasalpaso.test` | ADMIN | empleado 1 |
| `camila@demo.gasalpaso.test` | REPARTIDOR | empleado 2 |
| `diego@demo.gasalpaso.test` | REPARTIDOR | empleado 3 |
| `ana@demo.gasalpaso.test` | CLIENTE | cliente 1 |
| `bruno@demo.gasalpaso.test` | CLIENTE | cliente 2 |
| `carla@demo.gasalpaso.test` | CLIENTE | cliente 3 |

Camila cubre Santiago, Providencia, Ñuñoa y San Miguel. Diego cubre La Florida,
Maipú, Puente Alto y La Cisterna. Nombres, teléfonos y direcciones de clientes son ficticios.

## Modelo y scripts

Ver [documentación de FASE 4](docs/FASE-4.md) para control diario y cierre; [documentación de FASE 3](docs/FASE-3.md) para carrito, ventas y actualización aditiva; [FASE 2](docs/FASE-2.md) para JWT y administración; y [documentación de FASE 1](docs/FASE-1.md) para el orden de scripts, contratos de
`PkgVentas`, datos cruzados de ejemplo, cuadratura y reintentos de sincronización.

Oracle monta `db/oracle/` en `/container-entrypoint-initdb.d`. Su lanzador
`00-inicializar.sh` conecta como usuario de aplicación y ejecuta los SQL numerados
01–09 de `db/oracle/.scripts/`. La carpeta es oculta para evitar que el entrypoint
oficial los ejecute además como SYS. No omitirla al copiar el proyecto.
El archivo legacy original permanece intacto en `db/oracle/legacy/` y se ejecuta
explícitamente desde el script 01, incluidas sus pruebas y su rollback.
Mongo monta `db/mongo/` en `/docker-entrypoint-initdb.d` y ejecuta `init.js`.
Los scripts Oracle son **ordenados para instalación limpia**, no migraciones
idempotentes sobre una base existente. La semilla Mongo usa upserts para no duplicar datos.

## Ejecutar las pruebas

Control diario de FASE 4 (crea repartidores, cargas, ventas y cierres ficticios):

```powershell
Get-Content -Raw api/tests/control.mjs | docker compose exec -T api node --input-type=module
```

CRUD Mongo con salida de ejemplo en [docs/crud-mongo.md](docs/crud-mongo.md):

```powershell
docker compose exec -T mongo mongosh --quiet --file /docker-entrypoint-initdb.d/.examples/crud-demo.js
```

Se usa una base de demostración separada; no modifica las ventas reales.

Para el flujo de ventas de FASE 3 (solo bases demo, crea ventas y auditoría de prueba):

```powershell
Get-Content -Raw api/tests/ventas.mjs | docker compose exec -T api node --input-type=module
```

Ver [contratos, permisos, reintentos y ejemplos de FASE 3](docs/FASE-3.md).

Para la API de FASE 2, ver [la suite funcional](docs/FASE-2.md#pruebas-funcionales).
Desde PowerShell:

```powershell
Get-Content -Raw api/tests/api.mjs | docker compose exec -T api node --input-type=module
```

Las pruebas relacionales/integradas de FASE 1 siguientes requieren datos recién
sembrados y deben ejecutarse **antes** de las suites API y ventas, que crean usuarios, productos y ventas demo.

La suite Oracle comprueba descuentos, stock, anulaciones, protección de ventas,
cobro, auditoría y cuadratura. Hace rollback de sus cambios:

```sh
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.tests/ejecutar.sh
```

La suite integrada comprueba referencias Oracle/Mongo, rollback de varias líneas,
bloqueos concurrentes, índices y eliminación TTL real. Ejecutar con datos demo
recién creados; puede tardar hasta 90 segundos por el monitor TTL.

**PowerShell (Windows):**

```powershell
Get-Content -Raw db/tests/verificar.mjs | docker compose exec -T api node --input-type=module
```

**Bash (Linux/macOS):**

```sh
docker compose exec -T api node --input-type=module < db/tests/verificar.mjs
```

Las secuencias Oracle avanzan durante las pruebas aunque se haga rollback; es normal
que futuros IDs tengan saltos. Las pruebas no borran ni modifican persistentemente
las ventas demo. Crean y limpian un carrito temporal con ID de cliente 999999;
no utilizarlas sobre una base de producción.

## Operación y edición del frontend

`docker compose down` detiene el proyecto **sin borrar los datos**. Para volver,
`docker compose up -d`. Las contraseñas nuevas de `.env` no modifican usuarios de
volúmenes existentes: deben cambiarse también en la base o reinicializar datos demo.

Después de editar React, reconstruir desde la raíz:

```sh
docker compose up -d --build frontend
```

Para recarga al guardar: con Node.js 24 LTS local, ejecutar `docker compose stop frontend`;
en otra terminal entrar a `frontend`, ejecutar `npm ci` y `npm run dev`. Abrir
`http://localhost:3000`. Para detener Vite presionar Ctrl+C y volver a Docker con
`docker compose up -d frontend`. No se requiere Live Server.

## Build en el entorno cloud

Si la plataforma proporciona `CODEX_PROXY_CERT`, usar la CA pública del proxy
como secreto temporal de BuildKit (no se copia a la imagen ni se desactiva TLS):

```sh
docker compose -f docker-compose.yml -f docs/compose.cloud.yml build
docker compose up -d --build
```

En un computador con acceso normal a Internet no se necesita este override.
