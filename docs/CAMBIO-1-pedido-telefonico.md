# CAMBIO 1 — Pedido telefónico para cliente sin cuenta

Rama: feature/pedido-telefonico. Base: FASE 7. Se conserva el contrato de llamadas con
id_cliente y los flujos CLIENTE, REPARTIDOR y ADMIN. Esta entrega requiere la migración
Oracle 10 antes de iniciar la nueva API. No ejecutar legacy ni borrar volúmenes.

## Comportamiento

En ADMIN → Pedido por llamada se ingresan nombre, teléfono, calle, número, comuna,
referencia opcional, productos y método de cobro. No pide correo, contraseña ni cuenta.
Muestra subtotal, descuento (10% desde $30.000) y total antes de confirmar. Los errores
se indican por campo y los datos del formulario se conservan ante un rechazo.

El teléfono admite espacios, guiones, paréntesis y prefijo +56 (también 0056). La API
y Oracle lo normalizan a nueve dígitos empezando con 9. No se aceptan letras ni otros
números de país. Se guarda, por ejemplo, 912345678 y no +56 9 1234-5678.

El cliente y su venta se escriben en la misma transacción. Si falla el stock, se revierte
el cliente nuevo y cualquier cambio de dirección principal. El índice único y el bloqueo
de fila coordinan solicitudes concurrentes: puede haber varias ventas, pero un solo
cliente por teléfono. La clave de idempotencia conserva una sola venta al reintentar.

- Teléfono nuevo: crea Cliente sin Usuario; usa la primera entrega como principal.
- Teléfono existente: reutiliza id_cliente y nombre ya guardado. El nombre escrito en
  la llamada no sobrescribe el de una cuenta existente. Se mantiene la dirección
  principal, salvo guardar_como_principal=true. La entrega siempre usa la dirección
  específica del pedido.
- Principal: Cliente conserva calle+número en direccion_principal y el id_comuna.
  La referencia completa queda en el pedido (Cliente no tiene campo de referencia).
- Registro web posterior: si el teléfono pertenece a un Cliente sin Usuario, vincula
  la cuenta nueva al mismo id_cliente y actualiza su perfil con los datos declarados
  en el registro. Sus pedidos telefónicos anteriores aparecen en Mis pedidos.
- Si ese Cliente ya tiene Usuario, responde 409 por teléfono y no crea otra cuenta.
  La restricción única Usuario.id_cliente permanece intacta.
- Los pedidos Mongo conservan la instantánea {id_cliente,nombre,telefono} y la dirección
  de entrega. Cambios posteriores del perfil no reescriben esas instantáneas.
- Eventos PEDIDO_TELEFONICO y CLIENTE_VINCULADO_USUARIO se encolan en Oracle para
  eventos_auditoria, con el mismo mecanismo durable Oracle→Mongo de las fases anteriores.

## Migración 10 y contactos históricos

`db/oracle/.scripts/10-cliente-telefono.sql` es nuevo e idempotente. Agrega índice
único uq_cliente_telefono, comprobación de formato y trigger de normalización. El campo
telefono ya era NOT NULL y sigue obligatorio. Cliente no referencia a Usuario: puede
existir sin correo ni contraseña; el vínculo opcional sigue desde Usuario hacia Cliente.

Los teléfonos duplicados o inválidos antiguos no se pueden convertir automáticamente
en teléfonos reales únicos. La migración conserva TODOS los clientes, usuarios, ventas
y sus identificadores. No fusiona personas ni cambia Venta.id_cliente.

1. Normaliza todos los teléfonos válidos. Para duplicados conserva el número real en
   el cliente más antiguo con cuenta; si ninguno tiene cuenta, en el de menor id_cliente.
2. A los demás asigna un teléfono **provisional**, marcado telefono_revision=1. Se elige
   de forma determinista sin ocupar ninguno de los números reales presentes.
3. Guarda teléfono original, normalizado, provisional y motivo en Cliente_telefono_revision.
   Repetir la migración conserva esos valores, sin volver a numerarlos.
4. Un provisional NO permite buscar/crear una llamada por teléfono ni vincular una cuenta
   nueva automáticamente: responde 409 solicitando revisión. Los usuarios existentes y
   referencias de pedidos por id_cliente se conservan. Usuarios muestra un aviso al editar
   esos contactos. Confirmar un número real distinto y único con el cliente antes de cambiarlo;
   el trigger quita la marca al cambiar efectivamente el teléfono. Guardar el mismo provisional
   no lo convierte en un contacto verificado. El registro de migración permanece para trazabilidad.

Consultar pendientes desde SQL Developer con el usuario de aplicación:

```sql
SELECT c.id_cliente,c.nombre,c.telefono AS telefono_provisional,
       r.telefono_original,r.telefono_normalizado,r.motivo
FROM Cliente c JOIN Cliente_telefono_revision r ON r.id_cliente=c.id_cliente
WHERE c.telefono_revision=1 ORDER BY c.id_cliente;

SELECT telefono,COUNT(*) FROM Cliente GROUP BY telefono HAVING COUNT(*)>1;
SELECT index_name,uniqueness FROM user_indexes WHERE index_name='UQ_CLIENTE_TELEFONO';
```

Los números provisionales no se deben usar para llamar a personas. Son una resolución
trazable de datos históricos incompatibles con la nueva unicidad, no teléfonos confirmados.

## Contrato HTTP

Nuevo cliente o búsqueda por teléfono (ADMIN):

```http
POST /api/pedidos/telefonico
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
Idempotency-Key: llamada-ejemplo-001
```

```json
{
  "cliente": {
    "nombre": "María Pérez",
    "telefono": "+56 9 1234-5678",
    "direccion": {
      "calle": "Los Aromos",
      "numero": "123",
      "comuna": 1,
      "referencia": "Portón azul"
    }
  },
  "items": [{"id_producto": 2, "cantidad": 2}],
  "metodo_cobro": "EFECTIVO",
  "guardar_como_principal": false
}
```

comuna admite el ID de una comuna existente o su nombre exacto (sin distinguir mayúsculas).
También se admite id_comuna en su lugar, pero no ambos. numero es texto, para permitir
números de departamento y letras. Se admite la variante sin envoltorio cliente, con nombre,
telefono y direccion al nivel principal; no mezclar variantes.

Contrato previo conservado:

```json
{
  "id_cliente": 1,
  "direccion_entrega": {"calle":"Los Aromos","numero":"123","id_comuna":1},
  "items": [{"id_producto":2,"cantidad":2}],
  "metodo_cobro": "EFECTIVO"
}
```

Puede incluir guardar_como_principal=true explícitamente. La huella de idempotencia
del contrato previo se conserva cuando no se solicita ese cambio: las claves anteriores
siguen recuperando su pedido, no creando otra venta. Los roles y rutas no cambian.

Validación: nombre 2–80 caracteres, teléfono móvil normalizado, comuna existente,
1–50 productos distintos con cantidades enteras 1–9999. Respuesta de error:

```json
{"mensaje":"El teléfono debe tener 9 dígitos y comenzar con 9. Puedes incluir +56.","campos":{"telefono":"El teléfono debe tener 9 dígitos y comenzar con 9. Puedes incluir +56."}}
```

HTTP 201 al crear, 200 al recuperar la misma clave; 400 datos inválidos; 409 stock,
cuenta ya vinculada o contacto provisional; 403 para CLIENTE/REPARTIDOR.

## Actualizar desde FASE 7 por PowerShell

Descargar Gas-Al-Paso-pedido-telefonico.zip en Descargas y guardar los archivos abiertos.

```powershell
cd C:\Users\gerar\Desktop\Gas-Al-Paso-fase0\Gas-Al-Paso-github
git status
```

Continuar con working tree clean. Conservar primero cualquier cambio local. Crear
la rama (si ya existe, usar git switch feature/pedido-telefonico):

```powershell
git switch -c feature/pedido-telefonico
$zip = "$env:USERPROFILE\Downloads\Gas-Al-Paso-pedido-telefonico.zip"
$destino = (Get-Location).Path
$temporal = Join-Path $env:TEMP ("gas-telefono-" + [guid]::NewGuid())
if (!(Test-Path $zip)) { throw "No encuentro el ZIP en Descargas." }
if (!(Test-Path "$destino\.git") -or !(Test-Path "$destino\.env")) { throw "Verifica la carpeta con .git y .env." }
Expand-Archive -LiteralPath $zip -DestinationPath $temporal
$origen = Join-Path $temporal "Gas-Al-Paso"
if (!(Test-Path "$origen\docker-compose.yml")) { throw "Estructura de ZIP incorrecta." }
robocopy $origen $destino /E /XD .git node_modules dist /XF .env
if ($LASTEXITCODE -ge 8) { throw "Falló la copia. No continúes." }
```

Abrir Docker Desktop. Aplicar la migración con API y frontend detenidos para evitar
escrituras durante la normalización. Ejecutar cada comando por separado y detenerse
ante cualquier error; no iniciar la API si SQLPlus informa un error:

```powershell
docker compose config --quiet
docker compose stop api frontend
docker compose up -d --wait oracle mongo
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-telefono.sh
docker compose up -d --build
docker compose ps
curl.exe http://localhost:4000/api/health
```

Conservar .env y JWT_SECRET. **No usar down -v ni volver a ejecutar el legacy.**
El actualizador aplica solo el script 10 sobre FASE 7. Una instalación nueva ejecuta
01–10 en orden. Si todavía faltan migraciones 07–09, aplicar antes aplicar-control.sh.
Al terminar SQLPlus muestra cuántos contactos requieren revisión, sin listar teléfonos
personales por consola. Consultarlos con la SQL de arriba si el número es mayor a cero.

## Probar manualmente

1. Entrar en http://localhost:3000/login como admin@demo.gasalpaso.test, contraseña
   de desarrollo GasPasoDemo2026! (solo datos demo).
2. Pedido por llamada: ingresar un nombre, teléfono de prueba NUEVO, dirección y comuna.
   No hay selección de cuenta, correo ni contraseña. Elegir productos y método de cobro.
3. Con dos Gas 11kg de precio demo $15.000, revisar subtotal $30.000, descuento $3.000,
   total $27.000. Confirmar: aparece Recibido y listo para Asignar repartidor.
4. Crear otra llamada con el mismo teléfono, escrito con +56 o espacios y otra dirección.
   El id_cliente de ambos pedidos debe coincidir. Sin marcar Guardar como principal,
   Cliente.direccion_principal conserva la primera dirección.
5. Repetir marcando Guardar esta dirección como principal y comprobar que ahora cambia.
6. En una ventana de incógnito registrarse como CLIENTE con el mismo teléfono y un correo
   nuevo. Se vincula al Cliente existente y Mis pedidos incluye las llamadas anteriores.
   Intentar una segunda cuenta con ese teléfono debe devolver conflicto, no duplicar.
7. Probar teléfono incompleto, nombre de un carácter y carrito sin productos: mensajes por campo.

Desde SQL Developer:

```sql
SELECT c.id_cliente,c.nombre,c.telefono,c.direccion_principal,c.id_comuna,u.id_usuario,u.email
FROM Cliente c LEFT JOIN Usuario u ON u.id_cliente=c.id_cliente
WHERE c.telefono='912345678';
SELECT id_venta,id_cliente,id_pedido_mongo,total_venta,estado_pago
FROM Venta WHERE id_cliente=:id_cliente ORDER BY id_venta DESC;
```

Usar teléfonos ficticios distintos para cuentas de prueba diferentes; desde este cambio
el teléfono identifica un único Cliente. Los ejemplos históricos de fases anteriores que
reutilizan el mismo número para varias personas deben usar números distintos.

## Pruebas automatizadas

Solo desarrollo: crean sus propios clientes, cuentas, productos y pedidos.

```powershell
Get-Content -Raw api/tests/telefonico.mjs | docker compose exec -T api node --input-type=module
```

Con Node.js 24 y Chromium instalados como indica docs/FASE-5.md:

```powershell
$env:E2E_REAL = "1"
npm run test:e2e --prefix frontend
Remove-Item Env:E2E_REAL
```

Las fixtures de cuentas nuevas ahora generan teléfonos distintos para respetar la
unicidad. No se cambian las expectativas de ventas, descuentos, permisos o cierres.
La prueba del cambio cubre respuesta perdida, recarga y reintento de la misma clave.

## Subir tu rama cuando termines de revisar

```powershell
git add .
git status --short
git diff --cached --check
git commit -m "Pedido telefonico sin cuenta y cliente unico por telefono"
git push -u origin feature/pedido-telefonico
```

Verificar antes que .env, node_modules y test-results no estén preparados. El ZIP no
publica automáticamente en GitHub. Esperar revisión antes de nuevos cambios.

## Validación realizada

- Migración sobre datos con teléfonos repetidos e inválidos: conserva todas las ventas,
  sus totales e id_cliente. Teléfonos únicos y registro de revisión; repetir conserva
  los mismos provisionales. Instalación 01–10 y repetición de 10 en esquema vacío:
  tres clientes únicos y cero objetos inválidos.
- API específica: 61 comprobaciones aprobadas. Incluye formatos equivalentes, cliente
  sin Usuario, reutilización, principal opcional, instantáneas, contrato antiguo y
  su huella de idempotencia, registro/vinculación y rechazos por cuenta ya existente.
- Altas simultáneas de llamadas, dos registros sobre el mismo teléfono y llamada/registro
  en paralelo: un Cliente y como máximo un Usuario. Falta de stock revierte Cliente
  nuevo y cambios de principal; se conserva el evento de rechazo.
- 20 pruebas de navegador de los tres roles aprobadas, incluida compra y jornada previas.
  El nuevo caso móvil comprueba errores por campo, pérdida de respuesta, recarga,
  reintento sin duplicar stock/venta, teléfono repetido y registro web posterior.
  Comprobación adicional del formulario: los errores desaparecen al corregir los campos.
- Regresiones: API base 98, ventas 181 y control diario 123 comprobaciones aprobadas.
  Compilación Vite y cuatro servicios saludables.
