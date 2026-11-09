# CAMBIO 2 — Búsqueda y ficha de clientes por teléfono (ADMIN)

Rama feature/buscar-cliente-telefono, basada en el contenido completado del CAMBIO 1.
El ZIP es acumulativo: contiene fases 0–7 y cambios 1 y 2. El usuario revisará y subirá
los tres cambios juntos cuando termine la mejora pendiente; esta entrega no publica
ramas ni modifica GitHub. Puedes esperar el tercer ZIP antes de instalar.

## Qué se agregó

- ADMIN → Clientes por teléfono: búsqueda de clientes con o sin cuenta. Escribir
  al menos cuatro dígitos, por ejemplo los últimos cuatro. Espera 300 ms desde la
  última edición, consulta hasta diez coincidencias y muestra nombre, teléfono,
  dirección principal, cantidad de pedidos y fecha del último pedido.
- Ficha con historial reciente (máximo diez pedidos), acceso al detalle de cada pedido,
  corrección de nombre/dirección y botón Nuevo pedido para este cliente.
- El botón abre Pedido por llamada con nombre, teléfono, calle, número, comuna y
  referencia precargados y editables. La dirección de entrega puede cambiar sin
  modificar la principal; se conserva el checkbox explícito del CAMBIO 1.
- El mismo buscador y ficha se pueden usar dentro de Pedido por llamada. Elegir
  otro cliente no elimina los productos que ya seleccionaste.
- Si no hay resultados, Crear cliente y pedido abre el formulario con el teléfono
  escrito. Si era un fragmento, se deben completar sus nueve dígitos antes de confirmar.
- Estados de carga, vacío y error; peticiones canceladas y protección contra respuestas
  atrasadas. Con menos de cuatro dígitos no hay consultas. Un error NO se presenta como
  Sin resultados ni ofrece crear un contacto basándose en una búsqueda fallida.

## API (solo ADMIN)

### GET /api/clientes?telefono=1234

Admite entre 4 y 9 dígitos normalizados; permite espacios/guiones y +56. La coincidencia
es parcial en cualquier parte del teléfono. No admite comodines ni parámetros para
ampliar el límite. Oracle usa INSTR con bind variables, y máximo 10 filas. Una coincidencia
completa aparece primero; después ordena por nombre e id_cliente.

```json
[
  {
    "id_cliente": 12,
    "nombre": "María Pérez",
    "telefono": "912341234",
    "direccion_principal": "Los Aromos 123",
    "id_comuna": 1,
    "comuna": "Santiago",
    "cantidad_pedidos": 3,
    "fecha_ultimo_pedido": "2026-11-06T10:00:00.000Z"
  }
]
```

Una lista vacía significa sin coincidencias. 400 para búsqueda corta/inválida, 401
sin sesión y 403 para CLIENTE/REPARTIDOR. Los contactos provisionales marcados por la
migración 10 se excluyen de la búsqueda normal; su ficha por ID permite identificarlos
como pendientes de revisión y no ofrece crear un pedido por teléfono para ellos.

### GET /api/clientes/:id

Devuelve los datos actuales y el resumen anterior, más pedidos_recientes (últimos 10
ordenados por creado_en e identificador descendente) y direccion_entrega_sugerida cuando
se conocen calle/número de la principal. Historial, cantidad y fecha se obtienen desde
Mongo por cliente.id_cliente, no por el teléfono de las instantáneas: siguen asociados
si el teléfono del cliente se corrige. Incluye WEB/LLAMADA y pedidos cancelados que
siguen guardados; los documentos eliminados no se cuentan. Sin pedidos: cantidad 0,
fecha null y lista vacía. Cliente inexistente: 404.

Los datos históricos son los registrados en Mongo. Si hay proyección pendiente desde
Oracle, actualizar después de sincronizar. Si Mongo no está disponible se devuelve 503,
no un contador cero inventado. Para el estado operativo actual abrir Ver pedido.

### PATCH /api/clientes/:id

Permite nombre y/o dirección principal, sin cambiar teléfono, Usuario ni pedidos pasados.
Se valida nombre 2–80 caracteres y comuna existente. Ejemplo estructurado:

```json
{
  "nombre": "María Pérez Corregida",
  "direccion_principal": {
    "calle": "Nueva Calle",
    "numero": "450",
    "comuna": 2,
    "referencia": "Departamento B"
  }
}
```

También permite direccion_principal como texto (1–200 caracteres) e id_comuna al nivel
principal. Esa variante conserva datos antiguos sin inventar una separación calle/número.
No mezclar ambas formas de indicar la comuna. Un parche vacío o campos ajenos (como
telefono) produce 400. Todos los cambios se confirman en Oracle en una transacción y
deja evento CLIENTE_ACTUALIZADO en la cola durable de auditoría. Si Mongo falla después,
el cambio permanece en Oracle con sincronizacion PENDIENTE.

## Direcciones: ampliación Oracle 11

El modelo anterior solo guardaba la dirección principal como texto. Para precargarla
sin adivinar, 11-direccion-cliente.sql agrega columnas opcionales calle_principal,
numero_principal y referencia_principal. No cambia el texto anterior ni borra datos.
Es idempotente y recompila/verifica los objetos del esquema.

- Llamadas nuevas y Guardar como principal escriben texto y campos estructurados.
- Corregir la ficha con calle/número separados actualiza ambos formatos.
- Registro/edición de usuarios con una principal distinta en texto limpia la estructura
  anterior para evitar usar datos viejos. Cambiar solo nombre o conservar la misma
  dirección no elimina su estructura.
- Para direcciones antiguas, la ficha busca una entrega realmente registrada que coincida
  con el texto principal y la comuna. Puede recuperar esa estructura aunque el pedido
  sea anterior a los diez mostrados. No divide el texto con una expresión regular.
- Si no hay estructura ni coincidencia real, precarga el texto y pide verificar calle
  y completar número. No inventa un número ni usa ciegamente la última entrega, que
  podría ser distinta de la principal.

La API crea el índice Mongo ix_pedido_cliente_reciente sobre cliente.id_cliente,
creado_en y _id. También se incluye en init.js para instalaciones nuevas. La creación
es idempotente, se reintenta al consultar si Mongo no estaba disponible inicialmente y
no bloquea el arranque de las operaciones Oracle. No requiere borrar colecciones.

## Privacidad de logs

La API no imprime teléfonos, consultas, cuerpos ni cadenas de conexión. Sus errores
registran solo nombre/código. El proxy de Vite también oculta el valor telefono en sus
errores para evitar filtrarlo si la API está apagada. Las respuestas ADMIN y la ficha
sí muestran el teléfono, porque forman parte de la función solicitada.

## Actualización acumulativa desde FASE 7 o CAMBIO 1

Puedes esperar la tercera mejora y usar su ZIP acumulativo. Si quieres probar este
cambio ahora, descarga Gas-Al-Paso-buscar-cliente-telefono.zip en Descargas. Guardar
archivos abiertos y revisar cambios antes de copiar:

```powershell
cd C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github
git status
```

Continuar con working tree clean; conservar antes cualquier cambio local. Crear rama
(si ya existe, usar git switch feature/buscar-cliente-telefono):

```powershell
git switch -c feature/buscar-cliente-telefono
$zip = "$env:USERPROFILE\Downloads\Gas-Al-Paso-buscar-cliente-telefono.zip"
$destino = (Get-Location).Path
$temporal = Join-Path $env:TEMP ("gas-clientes-" + [guid]::NewGuid())
if (!(Test-Path $zip)) { throw "No encuentro el ZIP en Descargas." }
if (!(Test-Path "$destino\.git") -or !(Test-Path "$destino\.env")) { throw "Verifica la carpeta con .git y .env." }
Expand-Archive -LiteralPath $zip -DestinationPath $temporal
$origen = Join-Path $temporal "Gas-Al-Paso"
if (!(Test-Path "$origen\docker-compose.yml")) { throw "Estructura de ZIP incorrecta." }
robocopy $origen $destino /E /XD .git node_modules dist /XF .env
if ($LASTEXITCODE -ge 8) { throw "Falló la copia. No continúes." }
```

Abrir Docker Desktop, esperar y ejecutar cada comando por separado, deteniéndose ante
cualquier error. El helper aplica 10 y 11, por lo que también sirve si aún no instalaste
el CAMBIO 1. Si ya aplicaste 10, repetirla conserva los mismos contactos.

```powershell
docker compose config --quiet
docker compose stop api frontend
docker compose up -d --wait oracle mongo
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-clientes.sh
docker compose up -d --build
docker compose ps
curl.exe http://localhost:4000/api/health
```

Conservar .env, JWT_SECRET y volúmenes. No usar down -v ni volver a ejecutar legacy.
Si faltan migraciones 07–09, aplicar antes aplicar-control.sh. Una instalación nueva
usa 01–11. El índice Mongo se prepara automáticamente al iniciar/consultar la API.
No hace falta ejecutar git push ahora: la revisión y subida de los tres cambios queda pendiente.

## Cómo probar

1. Ingresar en http://localhost:3000/login como ADMIN de desarrollo:
   admin@demo.gasalpaso.test / GasPasoDemo2026! (solo demo).
2. Crear una llamada con un teléfono ficticio nuevo como en CAMBIO 1 y anotar sus últimos
   cuatro dígitos. Se puede usar un cliente previo que ya tenga pedidos.
3. Menú Clientes por teléfono: escribir esos cuatro dígitos; aparece la búsqueda después
   de 300 ms. Seleccionar Ver ficha: revisar nombre, principal, contador y últimos pedidos.
4. Editar cliente: corregir nombre y dirección. Los pedidos anteriores mantienen sus
   nombres/direcciones históricos. Si la principal era texto antiguo, se puede activar
   Editar calle y número por separado y confirmarlos explícitamente.
5. Nuevo pedido para este cliente: comprobar precarga. Cambiar la entrega, agregar
   productos y confirmar sin Guardar como principal: conserva el mismo id_cliente y
   la principal corregida, pero el pedido usa su propia entrega.
6. Abrir Pedido por llamada vacío y probar el buscador integrado. Seleccionar la ficha
   y pulsar Nuevo pedido para este cliente aplica sus datos sin vaciar los productos
   que ya se hubieran elegido.
7. Buscar un teléfono sin coincidencias: Crear cliente y pedido lo precarga. Si solo
   escribiste cuatro dígitos, completar nueve antes de confirmar. Con menos de cuatro
   no debe consultarse ni mostrarse un supuesto cliente.
8. Repetir cambiando rápidamente los dígitos: no debe reaparecer una respuesta anterior.

SQL de comprobación (SQL Developer):

```sql
SELECT id_cliente,nombre,telefono,direccion_principal,id_comuna,
       calle_principal,numero_principal,referencia_principal
FROM Cliente WHERE INSTR(telefono,:fragmento)>0;
```

MongoDB Compass: colección pedidos, filtro {"cliente.id_cliente": ID_CLIENTE}.
Índice ix_pedido_cliente_reciente visible en Indexes.

## Pruebas automatizadas (desarrollo)

```powershell
Get-Content -Raw api/tests/clientes.mjs | docker compose exec -T api node --input-type=module
```

Con Node.js 24 y Chromium instalados (docs/FASE-5.md), pruebas de interfaz sin tocar bases:

```powershell
npm run test:e2e --prefix frontend -- tests/clientes-interfaz.spec.js
```

Para el flujo real y las regresiones usar exclusivamente las bases demo: crea contactos,
productos y pedidos propios.

```powershell
$env:E2E_REAL = "1"
npm run test:e2e --prefix frontend
Remove-Item Env:E2E_REAL
```

El reloj controlado de la prueba de debounce queda pausado para comprobar exactamente
299/300 ms; las pruebas de respuestas atrasadas verifican cancelación y resultados vigentes.
Las pruebas no ejecutan git push ni borran volúmenes. Continuidad en docs/CONTINUIDAD.md.

## Validación de esta entrega

- API del cambio: 77 comprobaciones aprobadas; mínimo de búsqueda, normalización,
  máximo diez, contador completo, historial máximo diez y orden descendente, permisos,
  modificaciones con binds, instantáneas conservadas y estadísticas por ID aunque cambie teléfono.
- 25 pruebas de navegador de los tres roles aprobadas. Caso real móvil: últimos cuatro
  dígitos, ficha, corrección, pedido precargado editable y mismo cliente; principal
  conservada en entrega temporal y productos conservados al usar el buscador integrado.
- Prueba de debounce con reloj pausado: ninguna consulta a 299ms, consulta a 300ms,
  ninguna con menos de cuatro dígitos. Tres repeticiones de las pruebas del buscador
  aprobadas; respuesta atrasada nunca sustituye la búsqueda vigente.
- Mongo detenido: HTTP 503, sin lista vacía falsa; al recuperarlo vuelve HTTP 200
  sin reiniciar API. API detenida: error del proxy con teléfono oculto en logs.
- Migraciones 10–11 repetidas e instalación aislada hasta 11: cero objetos inválidos.
- Regresiones: API base 98, ventas 181, control diario 123 y CAMBIO 1 61 comprobaciones.
  Compilación Vite y cuatro servicios saludables.
