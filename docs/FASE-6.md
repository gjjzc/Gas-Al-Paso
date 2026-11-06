# FASE 6 — Frontend REPARTIDOR

La jornada del repartidor se realiza desde el navegador, con diseño para celular,
controles de al menos 52px en las pantallas de trabajo y navegación entre Pedidos,
Venta calle, Ventas del día y Cierre. El cliente de FASE 5 sigue funcionando.
Las pantallas de administración quedan para FASE 7.

## Pantallas

- `/repartidor/pedidos`: solo pedidos propios, dirección completa y referencia,
  nombre/teléfono con botón de llamada, método solicitado, importe, productos e historial.
  Filtro de estado, paginación y actualización cada 10 segundos con pestaña visible.
  Iniciar camino pide confirmación; Entregar y cobrar exige seleccionar el método
  real, que puede ser diferente del solicitado. No lo preselecciona ni cobra dos veces
  al reintentar la misma entrega. El repartidor no puede cancelar pedidos.
- `/repartidor/tarreo`: selector paginado con cantidades, stock y precios del catálogo;
  resumen con subtotal, descuento y total, método de pago y confirmación explícita.
  Desde $30.000 aplica 10%. El cálculo previo usa centavos enteros; el comprobante
  muestra los importes definitivos de Oracle. No genera un pedido de reparto.
- `/repartidor/ventas`: ventas propias por fecha, tarjetas con canal, estado de pago,
  método real, productos y descuentos. El resumen incluye todo el día, aunque la
  lista tenga varias páginas. Solo COBRADAS suman dinero. Se actualiza cada 15 segundos.
- `/repartidor/cierre`: muestra efectivo y transferencia esperados, total, cargados y
  vendidos por producto, y pedidos sin resolver (también de otras fechas). Exige
  declarar dinero y cada devolución, aunque sea cero; no rellena con lo esperado.
  Antes de guardar advierte diferencias. Un cierre con diferencias se conserva como
  DESCUADRE; no se corrige artificialmente ni rechaza para ocultarlo. El resultado
  muestra dinero por método y balones por producto, persiste tras recarga y puede
  consultarse por fecha. El cierre bloquea nueva actividad de ese día.

Las confirmaciones usan un diálogo con foco y bloqueo mientras se guarda.
Los errores no se ocultan ni se interpretan como una operación completada.
Tarreo y cierre guardan la solicitud en sessionStorage antes del envío con una clave
idempotente por operación y usuario. Si se pierde la respuesta, incluso tras recargar,
se ofrece Reintentar misma solicitud. No cambiar de pestaña para recuperar ese envío.
La confirmación de estados también conserva el cuerpo original: repetir el mismo
estado y método es idempotente en la API. Los permisos reales se verifican en el servidor.

## Ajuste de API necesario

Nuevo `GET /api/cierre`, exclusivo REPARTIDOR. Usa el id_empleado del JWT, no admite
identificadores ajenos y solo acepta el filtro opcional `fecha=AAAA-MM-DD`. Devuelve
la misma cuadratura propia usada por POST /cierre, en una lectura consistente de Oracle:
fecha, dinero esperado por método, balones cargados/vendidos, pedidos pendientes y
cierre existente. No amplía los permisos de GET /cuadratura ni GET /cargas: siguen ADMIN.
No hay migraciones ni cambios en tablas en FASE 6. Los días siguen el calendario
Oracle y la fecha de cobro: entregas WEB/LLAMADA al cobrarse, TARREO al venderse.

## Actualizar desde FASE 5 sin perder datos

Descargar Gas-Al-Paso-fase6.zip en Descargas y guardar los archivos abiertos.
Desde PowerShell de VS Code:

```powershell
cd C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github
git status
```

Continuar con working tree clean. Si hay cambios, conservarlos en su rama antes de copiar.
Crear rama (si ya existe, usar git switch fase-6-frontend-repartidor):

```powershell
git switch -c fase-6-frontend-repartidor
$zip = "$env:USERPROFILE\Downloads\Gas-Al-Paso-fase6.zip"
$destino = (Get-Location).Path
$temporal = Join-Path $env:TEMP ("gas-fase6-" + [guid]::NewGuid())
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

Esta entrega requiere reconstruir API y frontend, porque agrega GET /cierre.
Conservar .env, JWT_SECRET y puertos que ya funcionan. No usar down -v ni reinicializar.
Si falta la actualización de FASE 4, aplicar primero .scripts/aplicar-control.sh como
indica docs/FASE-4.md. Cuentas de desarrollo existentes pueden tener cierre definitivo
para hoy; por eso la demostración siguiente crea cuentas y producto propios.

## Preparar una jornada de prueba desde PowerShell

Solo desarrollo. Genera un repartidor nuevo, un producto nuevo con stock/precio conocidos,
carga de cinco balones y un pedido asignado de una unidad. No borra datos existentes.
El ADMIN realiza esta preparación desde la API; su frontend vendrá en la siguiente fase.
Las claves incluidas aquí son ficticias y únicamente para desarrollo.

```powershell
$base = "http://localhost:4000/api"
$marca = [guid]::NewGuid().ToString("N")
$claveDemo = "JornadaDemo2026!"
$admin = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (@{
    email = "admin@demo.gasalpaso.test"; password = "GasPasoDemo2026!"
} | ConvertTo-Json)
$ha = @{ Authorization = "Bearer $($admin.token)" }
$correoRep = "rep-$marca@demo.test"
$rep = Invoke-RestMethod -Method Post -Uri "$base/usuarios" -Headers $ha -ContentType "application/json" -Body (@{
    nombre = "Repartidor jornada demo"; email = $correoRep; password = $claveDemo
    rol = "REPARTIDOR"; comunas = @(1)
} | ConvertTo-Json)
$producto = Invoke-RestMethod -Method Post -Uri "$base/catalogo" -Headers $ha -ContentType "application/json" -Body (@{
    nombre = "Gas jornada $marca"; descripcion = "Balón de prueba de 11 kg"
    categoria = "GAS"; peso = 11; precio = 15000; stock = 20
} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/cargas" -Headers $ha -ContentType "application/json" -Body (@{
    id_empleado = $rep.id_empleado
    items = @(@{ id_producto = $producto.id_producto; cantidad_cargada = 5 })
} | ConvertTo-Json -Depth 6)
$correoCliente = "cliente-$marca@demo.test"
Invoke-RestMethod -Method Post -Uri "$base/auth/registro" -ContentType "application/json" -Body (@{
    nombre = "Cliente jornada demo"; email = $correoCliente; password = $claveDemo
    telefono = "+56912345678"; direccion_principal = "Calle Demo 123"; id_comuna = 1
} | ConvertTo-Json)
$cliente = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (@{
    email = $correoCliente; password = $claveDemo
} | ConvertTo-Json)
$hc = @{ Authorization = "Bearer $($cliente.token)" }
Invoke-RestMethod -Method Post -Uri "$base/carrito/items" -Headers $hc -ContentType "application/json" -Body (@{
    id_producto = $producto.id_producto; cantidad = 1
} | ConvertTo-Json)
$pedido = Invoke-RestMethod -Method Post -Uri "$base/pedidos" -Headers $hc -ContentType "application/json" -Body (@{
    direccion_entrega = @{ calle = "Calle Demo"; numero = "123"; id_comuna = 1; referencia = "Portón azul" }
    metodo_cobro = "EFECTIVO"
} | ConvertTo-Json -Depth 6)
Invoke-RestMethod -Method Patch -Uri "$base/pedidos/$($pedido._id)/asignar" -Headers $ha -ContentType "application/json" -Body (@{
    id_empleado = $rep.id_empleado
} | ConvertTo-Json)
Write-Host "Login repartidor: $correoRep"
Write-Host "Contraseña demo: $claveDemo"
Write-Host "Producto de prueba: $($producto.nombre)"
Write-Host "Pedido: #$($pedido.id_venta)"
```

## Completar la jornada en pantalla

Abrir http://localhost:3000/login; salir de cualquier sesión anterior e ingresar con
el correo de repartidor mostrado por la consola y JornadaDemo2026!.

1. Pedidos: revisar dirección, teléfono y efectivo solicitado. Entrar primero a Cierre:
   aparece el pedido pendiente y no permite cerrar. Volver a Pedidos.
2. Pulsar Iniciar camino y confirmar. Luego Entregar y cobrar: elegir **Transferencia**
   como pago real y confirmar. El cliente lo solicitó en efectivo, pero se contabilizan
   correctamente $15.000 en transferencia porque fue el cobro real.
3. Venta calle: buscar el producto nuevo pasando páginas, elegir 2 unidades y efectivo.
   Vista previa: subtotal $30.000, descuento $3.000, total $27.000. Revisar y confirmar.
4. Ventas del día: total $42.000, efectivo $27.000, transferencia $15.000 y dos ventas cobradas.
5. Cierre: declarar efectivo 27000, transferencia 15000 y devolver 2 balones. Revisar y
   confirmar. Resultado CUADRADO: cinco cargados = tres vendidos + dos devueltos;
   diferencias de dinero y balones iguales a cero. El stock global del producto queda 17.
6. Recargar la página: sigue el cierre guardado. No se puede registrar otra venta hoy.

Para demostrar descuadre, preparar OTRA jornada con un repartidor nuevo. Hacer los
mismos movimientos pero entregar efectivo 26000 o devolver un balón en vez de dos.
La pantalla advierte diferencias, permite guardarlas explícitamente y muestra DESCUADRE.
No modificar el cierre ya guardado: es definitivo y no existe reapertura en esta fase.

### Usar el celular físico

Celular y PC deben estar en la misma red de confianza. Con Docker funcionando en el PC,
consultar su IPv4 de Wi-Fi con ipconfig y abrir en el celular http://IP_DEL_PC:3000.
Si Windows pregunta por acceso de red, permitir el puerto 3000 en tu red privada.
La API se accede a través del frontend; no cambiar la URL a api:4000 ni localhost del
celular. No es necesario publicar Oracle o Mongo a Internet. También se puede probar
el tamaño de celular desde las herramientas del navegador del PC.

## Pruebas automatizadas

Compilación sin bases: `npm ci --prefix frontend` y `npm run build --prefix frontend`.
Para las pruebas de navegador ver instalación de Chromium en docs/FASE-5.md.
Con frontend local o Docker funcionando en localhost:3000:

```powershell
npm run test:e2e --prefix frontend -- tests/interfaz.spec.js tests/repartidor-interfaz.spec.js
```

Esas pruebas interceptan respuestas y no escriben bases. Para la jornada real usar
exclusivamente las bases demo: crea sus propios usuarios, cargas, productos y ventas.

```powershell
$env:E2E_REAL = "1"
npm run test:e2e --prefix frontend
Remove-Item Env:E2E_REAL
Get-Content -Raw api/tests/control.mjs | docker compose exec -T api node --input-type=module
```

E2E_BASE_URL admite otro puerto; CHROMIUM_PATH permite usar Chromium del sistema.
Los resultados y capturas de pruebas están ignorados por Git.

## Subir la rama desde VS Code

```powershell
git add .
git status --short
git diff --cached --check
git commit -m "Fase 6: jornada del repartidor desde celular"
git push -u origin fase-6-frontend-repartidor
```

Revisar antes del commit que .env, node_modules y test-results no aparezcan preparados.
El ZIP no publica por sí solo la rama en GitHub.

## Validación de la entrega

- Compilación Vite correcta; reconstrucción API/frontend y cuatro servicios saludables.
- Trece pruebas de navegador aprobadas, incluyendo el flujo CLIENTE de fase 5 y dos
  jornadas REPARTIDOR reales contra Oracle y Mongo a 390px, sin desborde horizontal.
- Entrega con método real diferente del solicitado; cancelación del diálogo sin cambios.
- Calle: $30.000 menos $3.000 = $27.000. Jornada: $27.000 efectivo + $15.000
  transferencia = $42.000; cinco cargados, tres vendidos, dos devueltos; diferencia cero.
- Respuestas perdidas de venta y cierre, recarga y reintento: mismas claves, una sola
  operación efectiva y stock global 20→17. Cierre recuperado después de recargar.
- Faltante de $1.000 y un balón: advertencia previa y resultado DESCUADRE conservado.
- Aislamiento del reporte propio y errores 401/403/400/404 según corresponda; ADMIN
  y CLIENTE no acceden a GET /cierre. Cuadratura y cargas siguen solo ADMIN.
- Error al leer lo esperado bloquea el cierre; stock insuficiente no muestra venta
  guardada y conserva la selección. Generación de claves probada sin randomUUID.
- Suite de control diario anterior: 123 comprobaciones aprobadas.
