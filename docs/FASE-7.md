# FASE 7 — Frontend ADMIN

Panel de administración conectado a Oracle y Mongo, manteniendo los flujos CLIENTE
y REPARTIDOR. Rutas protegidas por ADMIN y permisos verificados también en la API.
Esta entrega no agrega tablas ni migraciones. Reconstruir API y frontend al actualizar.

## Pantallas

| Ruta | Funciones |
| --- | --- |
| /admin/pedidos | Tablero por estado, filtros de estado, fecha UTC y comuna; paginación y actualización cada 10 segundos. |
| /admin/pedidos/:id | Dirección, cliente, productos, importes e historial; asignación/reasignación, avance de estado con pago real, cancelación y eliminación de cancelados. |
| /admin/llamada | Búsqueda de cliente activo, selección de productos, dirección, cobro contra entrega y vista previa del descuento. |
| /admin/cargas | Carga o recarga acumulativa por repartidor y fecha, confirmación y consulta de acumulados. |
| /admin/productos | Búsqueda, alta, edición de datos/precio/stock, activación y eliminación lógica del catálogo. |
| /admin/usuarios | Búsqueda y filtros de rol/acceso, alta y edición de cuentas y datos del cliente. |
| /admin/cobertura | Asignación de varias comunas por repartidor activo y consulta de coberturas. |
| /admin/cuadratura | Resumen diario por trabajador, productos vendidos, dinero por método y balones; diferencias resaltadas. |
| /admin/auditoria | Eventos filtrados por tipo, fecha UTC, usuario o empleado; detalle y reintento de sincronización. |

El menú está disponible en escritorio y se adapta al celular. Las tablas se desplazan
horizontalmente dentro de las tarjetas. Hay estados de carga, error, vacío y confirmación.
Los contadores del tablero indican exclusivamente la página visible (15 pedidos):
no se presentan como totales históricos. Filtrar por estado/comuna para concentrarse
 en el trabajo pendiente. La lista de auditoría también indica el alcance de su página.

### Reglas conservadas

- Asignación: primero se muestran repartidores que cubren la comuna; el resto está
  en otro grupo. Se selecciona explícitamente y la API rechaza una jornada cerrada.
- ENTREGADO exige el pago real, que puede diferir del solicitado. Repetir el mismo
  estado y pago no vuelve a cobrar. El diálogo no permite confirmar sin elegir método.
- Cancelar anula la venta y devuelve stock. Solo se eliminan pedidos CANCELADOS;
  la venta anulada y su auditoría se conservan.
- Cada carga suma una recarga; no cambia Productos.stock. La pantalla muestra el acumulado.
- Pedido telefónico y carga conservan cuerpo/clave de idempotencia en sessionStorage
  antes de enviar. Ante respuesta perdida, incluso tras recarga, reintentar la misma
  solicitud en la misma pestaña. No se duplican ni ventas ni cargas.
- CRUD de usuarios/productos no tiene reintentos automáticos. Ante una respuesta
  perdida comprobar el listado antes de repetir un alta: podría haberse guardado.
- Eliminar producto lo desactiva; Editar permite reactivarlo. Conserva ventas anteriores.
  Cada cambio de precio/stock deja su auditoría y conserva el mecanismo Oracle→Mongo.
- No se convierte un CLIENTE en empleado ni al revés. Empleados pueden cambiar entre
  ADMIN/REPARTIDOR según la API. Cambiar rol, activo o contraseña pide confirmación,
  invalida sesiones y no permite quitar al último ADMIN activo. Contraseña en blanco
  al editar conserva la anterior. Las contraseñas nunca se muestran ni se guardan
  en sessionStorage. Desactivar cuentas conserva el historial.
- Cobertura administra las ocho comunas existentes; no agrega un CRUD de nuevas comunas.
  Guardar reemplaza el conjunto del repartidor; seleccionar ninguna lo deja sin cobertura.
- Cuadratura usa fecha de cobro de Oracle. ABIERTO muestra dinero/devoluciones por
  declarar, no ceros ficticios. Cierres y descuadres se ven por método y producto:
  un faltante de efectivo no se compensa visualmente con un sobrante de transferencia.
  Incluye empleados inactivos o con cambio de rol cuando tienen actividad histórica.
- Productos vendidos incluye accesorios; el control físico de balones sigue separado.
  También muestra nº de ventas, subtotal, descuento y total cobrado. Cierres desactualizados
  y pedidos pendientes se indican, con enlaces a sus pedidos.

## Ajustes compatibles de API

- GET /usuarios: filtros opcionales rol=CLIENTE|REPARTIDOR|ADMIN, activo=true|false
  y buscar (nombre/email, hasta 100 caracteres). Se aplican antes de paginar, con binds.
- GET /catalogo: buscar (nombre/descripción, hasta 100 caracteres) se aplica a los
  datos de Oracle antes de paginar el catálogo; se mantienen categoría y permisos.
- GET /cuadratura y GET /cierre: cada reporte incorpora productos_vendidos con
  id_producto, nombre, cantidad, subtotal, descuento y total, agrupados desde las
  líneas de ventas COBRADAS del día. Incluye accesorios y conserva los contratos previos.
- GET /cuadratura, /usuarios, /repartidores, /cargas y /auditoria siguen ADMIN;
  GET /cierre sigue siendo privado del REPARTIDOR. No se amplían permisos.

## Actualizar desde FASE 6 sin borrar datos

Descargar Gas-Al-Paso-fase7.zip en Descargas, conservando su nombre. Guardar todos
los archivos abiertos. Desde PowerShell de VS Code:

```powershell
cd C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github
git status
```

Continuar con working tree clean. Conservar antes cualquier cambio pendiente en tu rama.
Crear rama (si ya existe, usar git switch fase-7-frontend-admin):

```powershell
git switch -c fase-7-frontend-admin
$zip = "$env:USERPROFILE\Downloads\Gas-Al-Paso-fase7.zip"
$destino = (Get-Location).Path
$temporal = Join-Path $env:TEMP ("gas-fase7-" + [guid]::NewGuid())
if (!(Test-Path $zip)) { throw "No encuentro el ZIP en Descargas." }
if (!(Test-Path "$destino\.git") -or !(Test-Path "$destino\.env")) {
    throw "Verifica la carpeta del proyecto con .git y .env."
}
Expand-Archive -LiteralPath $zip -DestinationPath $temporal
$origen = Join-Path $temporal "Gas-Al-Paso"
if (!(Test-Path "$origen\docker-compose.yml")) { throw "Estructura de ZIP incorrecta." }
robocopy $origen $destino /E /XD .git node_modules dist /XF .env
if ($LASTEXITCODE -ge 8) { throw "Falló la copia. No continúes." }
```

Abrir Docker Desktop y esperar a que esté listo. Ejecutar cada comando por separado:

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl.exe http://localhost:4000/api/health
```

Conservar .env, JWT_SECRET y los puertos locales. No usar down -v ni ejecutar legacy.
FASE 7 no requiere migraciones sobre FASE 6. Si falta FASE 4, aplicar primero su
actualizador .scripts/aplicar-control.sh según docs/FASE-4.md.
Abrir http://localhost:3000/login, salir de otra cuenta si está abierta e ingresar:

- Email demo ADMIN: admin@demo.gasalpaso.test
- Contraseña demo: GasPasoDemo2026!

Estas credenciales y todas las siguientes son exclusivamente para desarrollo.
El login lleva al tablero /admin/pedidos. Si el navegador conserva archivos antiguos,
recargar con Ctrl+F5. Los permisos ADMIN no pueden obtenerse mediante el registro público.

## Recorrer un día completo desde las pantallas

Usar nombres y correos nuevos en cada demostración; las jornadas cerradas son definitivas.
Se puede usar como contraseña ficticia de las nuevas cuentas AdminJornada2026!.

1. **Productos** → Crear producto: nombre Gas Jornada Demo (o un nombre nuevo), categoría
   Gas, peso 11, precio 15000, stock 20 y una descripción. Guardar. Crear otro accesorio:
   Regulador Jornada Demo, peso 0.2, precio 4000, stock 20. Buscar cada producto por nombre.
   Probar Editar sobre el gas; modificar precio/stock y luego devolverlos a 15000/20
   para conservar los importes del ejemplo. Revisar CAMBIO_PRECIO/CAMBIO_STOCK en Auditoría.
2. **Usuarios** → Crear usuario: un REPARTIDOR nuevo y un CLIENTE nuevo. Para el cliente,
   registrar teléfono, dirección y comuna Santiago. Anotar sus correos y contraseña demo.
3. **Comunas de reparto**: elegir el repartidor nuevo, marcar Santiago y guardar.
4. **Cargas diarias**: elegir repartidor, buscar el gas creado, ingresar 3 y Revisar carga
   → Sumar carga. Preparar otra carga de 2: el acumulado debe ser 5. El stock de empresa
   del producto sigue siendo 20.
5. **Pedido por llamada**: buscar el cliente por correo, seleccionarlo, buscar el gas,
   elegir 2 unidades y completar calle, número y comuna Santiago. Elegir efectivo
   solicitado. Revisar: subtotal 30000, descuento 3000, total 27000. Confirmar.
6. En el detalle, **Asignar repartidor**: el nuevo aparece en Cubren la comuna. Confirmar.
   El ADMIN puede avanzar En camino y Entregar y cobrar con confirmación, o el repartidor
   puede hacerlo desde su cuenta. Al entregar seleccionar **Transferencia** como pago real.
7. En otro navegador o ventana de incógnito entrar como el repartidor (para no reemplazar
   la sesión ADMIN). **Venta calle**: 1 gas y 1 accesorio, efectivo. Total 19000, sin descuento.
8. En esa cuenta, **Cierre**: efectivo 19000, transferencia 27000, devueltos del gas 2.
   Confirmar. No debe quedar ningún pedido propio pendiente; si lo hay, resolverlo antes.
9. Volver al ADMIN → **Cuadratura** y filtrar ese trabajador: dos ventas cobradas,
   subtotal 49000, descuento 3000, total 46000. Productos vendidos: tres gases y un
   accesorio. Balones: 5 cargados = 3 vendidos + 2 devueltos. Diferencias cero, CUADRADO.
10. **Auditoría**: filtrar CARGA_DIARIA por ID de empleado para ver las dos recargas;
    consultar CIERRE_CAJA, ENTREGA, CAMBIO_PRECIO y CAMBIO_STOCK según lo realizado.

Para demostrar un descuadre, repetir con OTRO repartidor nuevo y declarar 18000 efectivo
(en lugar de 19000) o devolver un balón en lugar de dos. Guardar explícitamente el cierre
con diferencias: ADMIN lo verá resaltado en rojo, tanto en dinero como en balones.

### Otras comprobaciones

- Crear otro pedido recibido y cancelarlo: repone el stock. El botón de eliminar aparece
  solo al estar cancelado. Eliminarlo conserva la venta ANULADA y su auditoría.
- Eliminar un producto lo muestra Inactivo en administración y deja de ofrecerse al cliente.
  Editar y marcar activo permite recuperarlo.
- Editar un usuario y desmarcar activo invalida su sesión; la cuadratura histórica permanece.
- Cliente y repartidor no pueden entrar a /admin. Visitar la URL manualmente no da permisos.

## Pruebas automatizadas opcionales

Para compilar sin bases: Node.js 24, `npm ci --prefix frontend` y
`npm run build --prefix frontend`. Para instalar Chromium ver docs/FASE-5.md.
Con el sitio funcionando en localhost:3000:

```powershell
npm run test:e2e --prefix frontend -- tests/admin-interfaz.spec.js
```

La suite de interfaz intercepta respuestas y no modifica bases. La suite real crea
sus propios datos y movimientos de desarrollo; no ejecutarla sobre producción:

```powershell
$env:E2E_REAL = "1"
npm run test:e2e --prefix frontend
Remove-Item Env:E2E_REAL
Get-Content -Raw api/tests/api.mjs | docker compose exec -T api node --input-type=module
Get-Content -Raw api/tests/control.mjs | docker compose exec -T api node --input-type=module
```

E2E_BASE_URL permite otro puerto y CHROMIUM_PATH un Chromium ya instalado.
Ejecutar una suite de navegador a la vez si usa la misma carpeta test-results.
Los resultados generados están ignorados por Git y no se incluyen en el ZIP.

## Subir la rama desde tu consola

```powershell
git add .
git status --short
git diff --cached --check
git commit -m "Fase 7: administración completa y cuadratura diaria"
git push -u origin fase-7-frontend-admin
```

Revisar antes del commit que .env, node_modules y test-results no estén preparados.
El ZIP no publica automáticamente la rama en GitHub. La continuidad actualizada está
en docs/CONTINUIDAD.md.

## Validación de esta entrega

- Compilación Vite y reconstrucción de API/frontend correctas; servicios saludables.
- 19 pruebas de navegador aprobadas: ADMIN, CLIENTE y REPARTIDOR, incluyendo jornada
  real con dos recargas, llamada, asignación, entrega, venta de calle y cierre.
- CRUD de productos desde pantalla, auditoría de precio/stock, creación de cuentas,
  cobertura de comuna, orden de sugerencias, desactivación de usuario y conservación
  del cierre histórico; cancelación/eliminación conserva venta ANULADA y repone stock.
- Cuadratura real: dos ventas, subtotal $49.000, descuento $3.000, total $46.000;
  efectivo $19.000 y transferencia $27.000; tres gases y un accesorio vendidos;
  cinco cargados, tres vendidos, dos devueltos; diferencias cero.
- Descuadres resaltados por método y producto aun cuando la diferencia neta de dinero
  sea cero; último administrador protegido; rutas privadas y errores recuperables.
- Búsquedas antes de paginar y entrada literal con comillas sin interpretar SQL.
- Escritorio y móvil 390px comprobados, con desplazamiento de tablas dentro de tarjetas.
- Regresiones API base: 98 comprobaciones; control diario: 123 comprobaciones aprobadas.
