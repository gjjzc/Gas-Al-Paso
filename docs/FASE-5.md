# FASE 5 — Frontend base y CLIENTE

React + Vite + React Router, JavaScript y CSS propio. Esta fase incorpora todas las
pantallas del CLIENTE. ADMIN y REPARTIDOR pueden iniciar sesión y ven su espacio
según rol; sus pantallas operativas corresponden a las fases siguientes. Las API
de esos roles ya funcionan y permiten comprobar el seguimiento del cliente.

## Qué incluye

- Variables CSS: azul #0B3D91, naranja #FF6B1A, fondo claro; Inter si está disponible
  y respaldo de fuentes del sistema. No descarga fuentes ni imágenes externas.
- Logo, favicon e ilustraciones SVG propias. Diseño adaptable a celular y escritorio.
- Componentes Boton, EnlaceBoton, Tarjeta, Campo, Formulario, Tabla, Insignia,
  ErrorAviso, Cargando, Vacio, Totales y Encabezado.
- Navegación por rol, rutas protegidas, cierre de sesión y recuperación tras recarga.
- Login, registro CLIENTE con comunas, catálogo público paginado con filtros y búsqueda
  por nombre/descripción dentro de la página, carrito, confirmación, mis pedidos e historial.
- Carrito del servidor con cantidades, eliminación y vaciado. Expira a los 30 minutos
  desde la última modificación; abrir una pantalla no renueva el TTL. No reserva stock.
- Cobro contra entrega por efectivo o transferencia. No solicita tarjeta ni transfiere dinero.
- Los importes del carrito y pedido vienen de la API; Oracle confirma precio, stock
  y el descuento del 10% desde $30.000. El pedido muestra el total definitivo.
- Lista de pedidos consulta cada 10 segundos; detalle cada 5 segundos. No se solapan
  consultas y se pausa la actualización periódica con la pestaña oculta. Al volver se consulta.
  También hay actualización manual. Ante error se avisa y se conserva el último detalle.
- Cancelación del CLIENTE solo mientras RECIBIDO, con confirmación explícita.
- Confirmación idempotente: guarda clave, cuerpo y resumen en sessionStorage antes
  de enviar; si se pierde la respuesta permite reintentar lo mismo incluso tras recargar,
  sin crear otra venta. Un error de validación/stock permite corregir el pedido.

## Sesión y API

`frontend/src/services/api.js` centraliza JSON, Bearer, errores HTTP, timeout de 20s
y vencimiento 401. Token en sessionStorage, separado por pestaña; no guarda contraseñas.
Recargar conserva la sesión en la pestaña. Al cerrarla normalmente termina su almacenamiento
(el navegador puede restaurar pestañas); la API siempre verifica firma, expiración y usuario.
Al iniciar con token se valida /auth/me antes de permitir rutas privadas. La protección
visual no sustituye los permisos que ya aplica la API. No hay claves JWT en el frontend.

La confirmación pendiente conserva datos de entrega en esta pestaña, separados por
usuario y eliminados al obtener respuesta satisfactoria. Si aparece pendiente, reintentar
la misma confirmación antes de iniciar otra compra. No cambiar de pestaña para reintentar.

El navegador solicita `/api` en el mismo origen del frontend. Vite reenvía:
- Dentro de Compose: API_PROXY_TARGET=http://api:4000.
- Vite local: por defecto http://localhost:4000.
No se usa la dirección interna api:4000 directamente desde el navegador.

## Actualizar desde FASE 4 sin borrar las bases

Descargar Gas-Al-Paso-fase5.zip en Descargas. Guardar todos los archivos abiertos.
Desde PowerShell de VS Code:

```powershell
cd C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github
git status
```

Continuar con el árbol limpio. Si hay cambios, conservarlos en tu rama antes de copiar.
Crear la rama (si ya existe, usar git switch fase-5-frontend-cliente):

```powershell
git switch -c fase-5-frontend-cliente
$zip = "$env:USERPROFILE\Downloads\Gas-Al-Paso-fase5.zip"
$destino = (Get-Location).Path
$temporal = Join-Path $env:TEMP ("gas-fase5-" + [guid]::NewGuid())
if (!(Test-Path $zip)) { throw "No encuentro el ZIP en Descargas." }
if (!(Test-Path "$destino\.git") -or !(Test-Path "$destino\.env")) {
    throw "Verifica la carpeta del proyecto: deben existir .git y .env."
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

Abrir http://localhost:3000. Recargar con Ctrl+F5 si conserva la vista anterior.
No ejecutar down -v; conserva .env, JWT_SECRET y los puertos locales que funcionaban.
FASE 5 no agrega migraciones. Si aún no instalaste FASE 4, antes del arranque completo
levantar oracle y mongo y aplicar su actualización una vez:

```powershell
docker compose up -d oracle mongo
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-control.sh
```

La instalación desde cero conserva los scripts 01–09 de fases anteriores.

## Probar como cliente

1. En http://localhost:3000 entrar a Iniciar sesión > Crear una cuenta.
2. Completar nombre, teléfono, email nuevo, comuna, dirección y contraseña de al menos
   8 caracteres (máximo 72 bytes). Repetir contraseña y crear cuenta.
3. Iniciar sesión. Agregar, por ejemplo, dos Gas 11kg de $15.000 al carrito: subtotal
   $30.000, descuento $3.000, total $27.000. Si cambiaste los precios, usar los actuales.
4. Probar cantidad, quitar productos y recargar: el carrito permanece en el servidor
   hasta expirar. Pulsar Continuar, ingresar calle, número, comuna y método de cobro.
5. Confirmar: aparece Pedido #N, total definitivo y estado Recibido. Anotar N.
6. Abrir Mis pedidos y el historial. Mantener el detalle visible para la demostración
   siguiente. Un pedido aún RECIBIDO puede cancelarse desde esta pantalla.

### Cambiar estados con la API mientras miras el cliente

Las pantallas del repartidor vendrán después. Abrir otra terminal PowerShell y
usar las cuentas de desarrollo. Los siguientes comandos crean un repartidor de
prueba nuevo y abierto; no usan Diego, que puede tener un cierre diario ya guardado.
No alteran la sesión del navegador del cliente.

```powershell
$base = "http://localhost:4000/api"
$admin = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (@{
    email = "admin@demo.gasalpaso.test"; password = "GasPasoDemo2026!"
} | ConvertTo-Json)
$ha = @{ Authorization = "Bearer $($admin.token)" }
$numero = [int](Read-Host "Número de venta que ves en Pedido #N")
$pedidos = Invoke-RestMethod -Uri "$base/pedidos?limite=100" -Headers $ha
$p = $pedidos | Where-Object { $_.id_venta -eq $numero } | Select-Object -First 1
if (!$p) { throw "No encontré ese pedido entre los 100 más recientes." }
if ($p.estado -ne "RECIBIDO") { throw "Para esta demostración usa un pedido RECIBIDO nuevo." }
$correo = "rep-ui-$([guid]::NewGuid().ToString('N'))@demo.test"
$claveDemo = "ClaveUiDemo2026!"
$rep = Invoke-RestMethod -Method Post -Uri "$base/usuarios" -Headers $ha -ContentType "application/json" -Body (@{
    nombre = "Repartidor prueba de pantalla"; email = $correo; password = $claveDemo
    rol = "REPARTIDOR"; comunas = @([int]$p.direccion_entrega.id_comuna)
} | ConvertTo-Json)
Invoke-RestMethod -Method Patch -Uri "$base/pedidos/$($p._id)/asignar" -Headers $ha -ContentType "application/json" -Body (@{
    id_empleado = $rep.id_empleado
} | ConvertTo-Json)
```

Esperar hasta 5 segundos: el cliente ve Asignado. Luego:

```powershell
$sesionRep = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (@{
    email = $correo; password = $claveDemo
} | ConvertTo-Json)
$hr = @{ Authorization = "Bearer $($sesionRep.token)" }
Invoke-RestMethod -Method Patch -Uri "$base/pedidos/$($p._id)/estado" -Headers $hr -ContentType "application/json" -Body (@{
    estado = "EN_CAMINO"
} | ConvertTo-Json)
```

Observar En camino y ejecutar la entrega, que cobra la venta en Oracle:

```powershell
Invoke-RestMethod -Method Patch -Uri "$base/pedidos/$($p._id)/estado" -Headers $hr -ContentType "application/json" -Body (@{
    estado = "ENTREGADO"; metodo_pago = $p.metodo_cobro
} | ConvertTo-Json)
```

El cliente ve Entregado, cobrado y los cuatro pasos del historial. No puede cancelar
un pedido entregado. Esta demostración genera ventas reales en tus bases de desarrollo.

## Trabajar sin Docker en el PC

Puedes editar todo el código con Docker apagado. Para ver el diseño con Vite local
se necesita Node.js 24 y ejecutar desde la raíz:

```powershell
npm ci --prefix frontend
npm run dev --prefix frontend
```

Abrir localhost:3000. Si la API está apagada, las pantallas mostrarán error de conexión;
no hay pedidos simulados ni base alternativa. Para completar registro, carrito y pedidos
se necesitan API, Oracle y Mongo. Si ya corre el frontend en Docker, detener solo ese
servicio antes de usar Vite local para liberar el puerto 3000:

```powershell
docker compose stop frontend
docker compose up -d api
```

## Pruebas automatizadas (opcionales)

Compilar sin bases de datos: `npm ci --prefix frontend` y `npm run build --prefix frontend`.
Las pruebas de navegador requieren Node y Chromium; instalar una vez:

```powershell
npm ci --prefix frontend
cd frontend
npx playwright install chromium
cd ..
```

Con Vite local o frontend Docker en localhost:3000:

```powershell
npm run test:e2e --prefix frontend -- tests/interfaz.spec.js
```

Esas pruebas interceptan respuestas y no modifican bases. La suite real sí crea su
cliente, repartidor, producto y ventas; usar únicamente desarrollo con cuentas demo:

```powershell
$env:E2E_REAL = "1"
npm run test:e2e --prefix frontend
Remove-Item Env:E2E_REAL
```

Si se usa otro puerto, definir E2E_BASE_URL; si Chromium está instalado en el sistema
puede indicarse CHROMIUM_PATH en lugar de descargarlo. Los reportes y capturas de
fallos quedan fuera de Git. No es necesario instalar Playwright para usar el sitio.

## Subir a GitHub desde tu terminal

```powershell
git add .
git status --short
git diff --cached --check
git commit -m "Fase 5: frontend base y flujo del cliente"
git push -u origin fase-5-frontend-cliente
```

Antes del commit comprobar que no aparecen .env, node_modules ni test-results.
El ZIP no publica automáticamente la rama en GitHub.

## Validación de esta entrega

- Compilación Vite y reconstrucción del contenedor frontend correctas; los cuatro
  servicios Compose saludables y /api/health con Oracle y Mongo OK.
- Ocho pruebas de navegador Chromium aprobadas: siete de interfaz con respuestas
  controladas y una integral real contra Oracle y Mongo, sin errores de ejecución React.
- Registro/login, carrito persistente tras recarga, subtotal $30.000, descuento $3.000,
  total $27.000; respuesta perdida y reintento con la misma clave: una venta, stock 10→8.
- Cambios reales de repartidor: Asignado→En camino→Entregado visibles automáticamente,
  cuatro entradas de historial, cobro y permanencia tras recarga; cancelación repone stock.
- Errores recuperables, sesión expirada, protección por rol, carrito vacío/vencido y
  stock insuficiente; revisión visual escritorio 1440px y móvil 390px, sin desborde horizontal.
