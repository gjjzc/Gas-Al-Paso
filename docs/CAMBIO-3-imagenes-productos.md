# CAMBIO 3 — Imágenes locales de productos

Rama: feature/imagenes-productos, parte del commit 7dc259b del CAMBIO 2.
El ZIP Gas-Al-Paso-cambios-1-2-3-con-imagenes.zip incluye fases 0–7 y las tres mejoras de código.
No se subió a GitHub. Revisar los tres cambios antes de publicar.

## Imágenes profesionales incluidas

El usuario pidió una presentación comercial y autorizó imágenes generadas si no se
conseguían fotografías reales presentables. Se descartaron las fotos de stock
exploradas. La entrega incluye seis PNG generados con OpenAI: fondo blanco, colores
azul/naranja y productos limpios sin marcas; no son fotos de unidades reales.

Rutas listas: /productos/balon-5kg.png, balon-11kg.png, balon-15kg.png,
balon-45kg.png, regulador.png y manguera.png (todas bajo /productos/).
No hay que descargar ni renombrar nada. Procedencia documentada en
creditos-imagenes.md y en la página de créditos accesible desde el pie del sitio.
Los seis originales superan 200 KB; se conservan sin optimizar para que lo haga el
usuario. Tamaños y hashes verificables en imagenes-productos.json.

Los seis nombres JPG de la primera entrega se normalizan a sus PNG en la API,
incluyendo instantáneas antiguas. No se cambia el dinero, stock ni historial de
pedidos. La nueva migración 02 actualiza solo rutas del catálogo; no vuelve a aplicar
los cambios SQL anteriores. Las rutas locales personalizadas se conservan.

## Implementado

- Campo imagen del catálogo como ruta local. La API admite /productos/archivo con
  extensión jpg/jpeg/png/webp/avif/gif/svg, sin espacios ni tildes en la ruta; también
  /llama.svg como marcador del reemplazo. Vacío en alta/edición usa ese marcador.
  No se admiten URLs de internet, data URLs, consultas, fragmentos ni ../.
- Fotos en catálogo público (también visible como ADMIN), tabla de productos ADMIN,
  tarjetas del selector ADMIN, carrito, confirmación y detalles de pedidos del
  CLIENTE, ADMIN y REPARTIDOR. Proporción 4:3, object-fit cover, texto alternativo
  con el nombre, loading lazy, decoding async y fondo reservado durante la carga.
- Ausencia, ruta externa antigua o error al cargar: SVG Balon existente, con nombre
  accesible y el mismo espacio. No intenta cargar URLs externas ni encadena errores.
- Editor ADMIN: texto con ruta local y vista previa que reacciona al editarla;
  tras una imagen fallida se puede escribir otra ruta y recuperar la foto.
- Los nuevos carritos y pedidos guardan imagen en sus items. El pedido conserva la
  instantánea al editar después el catálogo. Los pedidos/carritos antiguos sin
  imagen se enriquecen al leerlos por id_producto, sin cambiar importes ni versiones.
  Si no hay metadatos disponibles se usa reemplazo; la foto no impide guardar ventas.
- Migración Mongo idempotente convierte imágenes embebidas/externas/ausentes del
  catálogo a las rutas previstas para los seis nombres demo; productos distintos
  reciben /llama.svg. Preserva rutas locales existentes y los demás campos.
  No toca pedidos/carritos ni agrega colecciones. No usar init.js sobre datos actuales.
- Créditos: docs/creditos-imagenes.md documenta la generación con OpenAI sin inventar
  licencias Creative Commons ni autores de fotografías de terceros.
- Comprobador de pesos: scripts/revisar-imagenes.mjs informa >200.000 bytes (200 KB),
  sin optimizar ni modificar originales. Los seis PNG presentes están medidos.

## Actualización de los tres cambios desde PowerShell

Guardar archivos abiertos. Abrir Docker Desktop. En una terminal de VS Code o
PowerShell (no copiar el prefijo PS C:\...>), entrar al repositorio:

```powershell
cd C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github
git status
```

Continuar solo con el árbol limpio; conservar primero cualquier edición local.
No cambiar de rama mientras haya trabajo sin guardar. Crear la rama (si ya existe,
usar git switch feature/imagenes-productos):

```powershell
git switch -c feature/imagenes-productos
$zip = "$env:USERPROFILE\Downloads\Gas-Al-Paso-cambios-1-2-3-con-imagenes.zip"
$destino = (Get-Location).Path
$temporal = Join-Path $env:TEMP ("gas-fotos-" + [guid]::NewGuid())
if (!(Test-Path $zip)) { throw "No encuentro el ZIP en Descargas." }
if (!(Test-Path "$destino\.git") -or !(Test-Path "$destino\.env")) { throw "Verifica la carpeta con .git y .env." }
Expand-Archive -LiteralPath $zip -DestinationPath $temporal
$origen = Join-Path $temporal "Gas-Al-Paso"
if (!(Test-Path "$origen\docker-compose.yml")) { throw "Estructura de ZIP incorrecta." }
robocopy $origen $destino /E /XD .git node_modules dist /XF .env
if ($LASTEXITCODE -ge 8) { throw "Falló la copia. No continúes." }
```

La copia agrega/reemplaza código; no usa /MIR ni borra tus fotos locales, .env ni .git.
Las seis imágenes ya están dentro de frontend/public/productos/. No ejecutar comandos
de borrado de volúmenes. Si ya aplicaste los cambios 1 y 2, no repitas su helper Oracle: usa la actualización
corta de la siguiente sección.
**Solo si todavía no instalaste los cambios 1 y 2**, ejecutar el siguiente bloque
comando por comando. Si ya estaban instalados, saltar a la actualización corta:

```powershell
docker compose config --quiet
docker compose stop api frontend
docker compose up -d --wait oracle mongo
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-clientes.sh
docker compose exec -T mongo bash /docker-entrypoint-initdb.d/migraciones/aplicar-imagenes-profesionales.sh
docker compose up -d --build
docker compose ps
curl.exe http://localhost:4000/api/health
```

El helper Oracle aplica 10–11, no borra ventas. Si partes de una instalación anterior
a FASE 7, revisar antes los pasos de aplicar-control.sh del README. Instalaciones
nuevas reciben 01–11 y rutas locales al inicializar. Conservar .env/JWT_SECRET y
puertos propios (ej. Oracle 1523, Mongo 27018). No hace falta detener bases con down.
Después de agregar/cambiar fotos se reconstruye frontend porque Docker copia public.

## Si ya instalaste los tres cambios anteriores

Después de copiar el ZIP (que conserva .env, .git y archivos locales), basta esta
actualización de imágenes. No ejecutar de nuevo las migraciones de clientes:

```powershell
docker compose up -d --wait mongo
docker compose exec -T mongo bash /docker-entrypoint-initdb.d/migraciones/aplicar-imagenes-profesionales.sh
docker compose up -d --build api frontend
curl.exe http://localhost:4000/api/health
```

La migración nueva 02 es idempotente y toca solo imagen del catálogo. La API conserva
compatibilidad con los nombres JPG predeterminados de la primera entrega. El resto
de las pantallas y las bases existentes no requieren reinicialización.

## Comprobar pesos

Con Node instalado: node scripts/revisar-imagenes.mjs, desde la raíz.
Sin Node local, usar el Node del contenedor (no descarga dependencias):

```powershell
docker compose cp scripts/revisar-imagenes.mjs frontend:/app/revisar-imagenes.mjs
docker compose exec -T frontend node revisar-imagenes.mjs /app/public/productos
```

## Cómo probar manualmente

1. Abrir http://localhost:3000/catalogo. Comprobar las seis imágenes incluidas, con aspecto uniforme.
   Al desplazar la página se cargan; no deben saltar las tarjetas. Revisar en ancho móvil.
2. Entrar como ADMIN demo: admin@demo.gasalpaso.test / GasPasoDemo2026! (solo desarrollo).
   Productos → Editar. Escribir /productos/balon-11kg.png; ver vista previa y guardar.
   Cambiarla por una ruta inexistente: aparece SVG y la tarjeta conserva el tamaño.
   Dejar vacío: también funciona. Volver a la ruta correcta: reaparece foto.
3. Como CLIENTE demo (ana@demo.gasalpaso.test, misma contraseña demo) agregar productos,
   abrir carrito, confirmar y entrar en detalle de pedido; fotos y nombres accesibles.
   Revisar que subtotal/descuento/total sean iguales a antes (10% desde $30.000).
4. Como ADMIN, abrir ese pedido. Como REPARTIDOR asignado, revisar Pedidos asignados.
   También se muestran sus fotos. Un pedido nuevo conserva su ruta aunque luego
   cambies el catálogo; una ruta eliminada del disco usa reemplazo.
5. Revisar los cambios 1–2 con sus respectivas guías antes de subir todo junto.
6. Ejecutar el comprobador de pesos y revisar los créditos de generación.

No se publica la rama ni se hace push en esta entrega: se espera revisión del usuario.

## Validación de la entrega base (antes de incluir las imágenes finales)

- 28 comprobaciones específicas de API: rutas locales persistidas en Mongo,
  rechazo de URLs externas/data/traversal, carrito antiguo sin cambiar versión,
  foto del pedido conservada tras editar catálogo, descuento correcto y vacío con reemplazo.
- Suite general de navegador: 28 pruebas aprobadas de los tres roles. Tras agregar
  la foto al selector ADMIN se aprobaron otras 7 focalizadas: ciclo ADMIN, llamada
  sin cuenta y las cuatro pruebas de imágenes (incluye detalle ADMIN y REPARTIDOR).
  Las pruebas de foto utilizan el SVG local existente como fixture, no fotos inventadas.
- Regresiones API base: 98; ventas: 181 comprobaciones aprobadas.
- Migración Mongo ejecutada dos veces: segunda ejecución modifica cero documentos;
  ningún catálogo queda con imagen externa o embebida. Helper de bash verificado.
- Compilación Vite aprobada. Comprobador de pesos ejecutado localmente y en Docker:
  verifica los seis PNG generados. La actualización actual no reejecuta la suite de
  ventas ni las migraciones anteriores: esas comprobaciones corresponden a la entrega base.

Pruebas específicas en una base demo (crean fixtures, no usar en producción):

```powershell
Get-Content -Raw api/tests/imagenes.mjs | docker compose exec -T api node --input-type=module
$env:E2E_BASE_URL = "http://localhost:3000"
npm run test:e2e --prefix frontend -- imagenes.spec.js
```

Las pruebas de navegador requieren dependencias de desarrollo y Chromium/Playwright
instalados; no son necesarias para la revisión manual ni para levantar Docker.

## Validación de las imágenes profesionales finales

- API: 31 comprobaciones aprobadas, incluida compatibilidad JPG → PNG.
- Navegador: cuatro pruebas de la integración base y cuatro de los archivos finales
  aprobadas (tres de vistas/archivos/créditos y una con API, Oracle y Mongo reales).
- Los seis archivos reales cargan en catálogo, carrito, detalle y vista previa ADMIN;
  la vista móvil de 390px no desborda. La foto inexistente muestra el reemplazo.
- Se comprobó que la página no solicita imágenes externas. Las imágenes finales son
  generadas y aparecen descritas como tales en el catálogo y los créditos.
- Migración nueva 02: seis rutas demo actualizadas; segunda ejecución, cero cambios.
  No se ejecutaron de nuevo scripts SQL de cambios anteriores.
- Compilación Vite aprobada. Los seis PNG se copian a dist/productos con sus bytes
  originales. Revisión de tamaños: los seis superan 200 KB, detallados en créditos.

Capturas entregadas: Gas-Al-Paso-catalogo-profesional.png y
Gas-Al-Paso-catalogo-profesional-movil.png. La captura del catálogo usa datos de prueba;
la carga de las seis rutas también se comprobó contra la API y bases reales.
