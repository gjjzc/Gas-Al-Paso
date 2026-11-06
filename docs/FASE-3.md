# FASE 3 — Flujo de ventas

API para carrito, checkout WEB, pedidos por llamada, asignación, entrega, cancelación,
baja de pedidos cancelados y tarreo. No agrega pantallas al frontend; usar
`docs/api.http`, PowerShell o Postman para probar esta fase.

## Actualizar desde FASE 2 sin borrar datos

Conservar `.env` y sus puertos/contraseñas/JWT_SECRET. Copiar los archivos nuevos en
la rama de FASE 3 y ejecutar desde la carpeta que contiene docker-compose.yml:

```powershell
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-ventas.sh
docker compose up -d --build api
docker compose up -d
docker compose ps
```

**No usar `down -v` ni volver a ejecutar el legacy.** El actualizador aplica 07 y
08 de forma idempotente: conserva ventas, usuarios y catálogo; agrega Solicitud_Venta
para deduplicar reintentos, una versión de carrito consumida única y un índice de búsqueda en Pendiente_Mongo. La inicialización
nueva ejecuta automáticamente 01–08. El índice TTL Mongo ya existe desde FASE 1;
la nueva versión de carrito se guarda como un campo adicional permitido por su validador.

## Endpoints nuevos

Todas las rutas llevan prefijo `/api` y JWT en `Authorization: Bearer TOKEN`.

| Método y ruta | Rol | Descripción |
| --- | --- | --- |
| `GET /carrito` | CLIENTE | Carrito propio y resumen; no renueva TTL. |
| `POST /carrito/items` | CLIENTE | Agrega/suma `{id_producto,cantidad}`. |
| `PATCH /carrito/items/:idProducto` | CLIENTE | Sustituye cantidad con `{cantidad}`. |
| `DELETE /carrito/items/:idProducto` | CLIENTE | Quita una línea. |
| `DELETE /carrito` | CLIENTE | Vacía el carrito propio. |
| `POST /pedidos` | CLIENTE | Confirma carrito con dirección y método de cobro. |
| `POST /pedidos/telefonico` | ADMIN | Crea LLAMADA para cliente existente y lista de ítems. |
| `GET /pedidos/mios` | CLIENTE | Solo pedidos propios, incluidos los creados por llamada. |
| `GET /pedidos/asignados` | REPARTIDOR | Solo los asignados al empleado autenticado. |
| `GET /pedidos` | ADMIN | Filtros estado, fecha y comuna; paginación. |
| `GET /pedidos/:id` | Según propiedad | ADMIN, cliente propietario o repartidor asignado. |
| `PATCH /pedidos/:id/asignar` | ADMIN | Asigna o reasigna pedidos RECIBIDOS/ASIGNADOS. |
| `PATCH /pedidos/:id/estado` | REPARTIDOR asignado o ADMIN | ASIGNADO → EN_CAMINO → ENTREGADO. |
| `PATCH /pedidos/:id/cancelar` | CLIENTE propietario o ADMIN | Aplica AnularVenta y restaura stock una vez. |
| `DELETE /pedidos/:id` | ADMIN | Solo CANCELADOS; elimina documento Mongo, conserva Oracle. |
| `POST /ventas/calle` | REPARTIDOR | Tarreo COBRADO con método de pago obligatorio. |
| `GET /ventas/dia` | REPARTIDOR o ADMIN | Ventas propias o filtros administrativos y resumen monetario. |

`id` de pedido es el ObjectId Mongo de 24 caracteres, no id_venta.
En asignación se envía `{id_empleado: 2}`, no id_usuario. Se mantiene la priorización
por comuna de `GET /repartidores?comuna=...`; ADMIN puede elegir otro repartidor activo
como alternativa. No se reasigna un pedido EN_CAMINO ni terminal.

Listados de pedidos aceptan `limite` (predeterminado 50, máximo 100), `offset`,
`estado`, `fecha` AAAA-MM-DD y `comuna` por nombre exacto o ID. Los límites de fecha
Mongo corresponden a timestamps UTC almacenados. Las fechas visibles del frontend
podrán formatearse en America/Santiago cuando se implemente su interfaz.
Ventas/día usa el calendario de SYSDATE de Oracle y permite `fecha`, `canal`,
`estado_pago` e `id_empleado` (este último solo ADMIN o el propio repartidor).

## Carrito y TTL

Solo acepta IDs de producto y cantidades enteras positivas (hasta 9999); no acepta
precios o nombres enviados por el cliente. Hasta 50 productos distintos. Guarda
nombre/precio de Oracle como snapshot al modificar la línea. Agregar suma y PATCH
sustituye; DELETE quita. No reserva ni descuenta stock.

Cada cambio genera una versión UUID y fija expira_en=actualizado_en+30 minutos.
GET no modifica ninguna fecha. Aunque el monitor TTL todavía no haya borrado el
documento, los carritos expirados se tratan como vacíos y no se pueden confirmar.
Los snapshots del carrito pueden quedar desactualizados: checkout vuelve a leer y
bloquear cada producto y usa los precios y existencias actuales de Oracle.

Los cambios de un cliente y su checkout se serializan con el bloqueo de su fila
Cliente en Oracle. Después de confirmar la venta se encola una limpieza Mongo que
solo elimina la versión consumida: un carrito editado después se conserva.
Si se cae Mongo después del commit, la limpieza queda pendiente junto al pedido.
La API trata como vacía una versión ya consumida, aunque Mongo todavía la conserve;
agregar un producto comienza otro carrito y no arrastra líneas ya vendidas.

## Creación y totales

WEB requiere `{direccion_entrega:{calle,numero,id_comuna,referencia?},metodo_cobro}`.
Cliente, nombre y teléfono salen del usuario autenticado y Oracle. No admite
id_cliente ni ítems en el cuerpo: usa exclusivamente su carrito vigente.

LLAMADA requiere id_cliente existente, dirección, metodo_cobro e
`items:[{id_producto,cantidad}]`. No usa ni modifica el carrito de ese cliente.
Si el cliente no existe, ADMIN debe crearlo mediante POST /usuarios antes.
TARREO requiere los ítems y metodo_pago; usa el repartidor autenticado, cliente nulo
y sin pedido de reparto. Métodos permitidos: EFECTIVO y TRANSFERENCIA.

Cada venta usa **una sola conexión y transacción Oracle**:

1. Reserva su clave en Solicitud_Venta.
2. Ejecuta PkgVentas.CrearVenta.
3. Bloquea productos en orden de ID, lee precios/stock actuales y ejecuta
   PkgVentas.AgregarItem por línea. TrgDetalleStock valida y descuenta stock.
4. Ejecuta PkgVentas.FinalizarVenta: subtotal agregado, descuento de 10% desde
   $30.000 inclusive y total. Los importes de respuesta se leen de Oracle.
5. Relaciona Solicitud_Venta con id_venta y guarda snapshots/eventos en Pendiente_Mongo.
6. Commit único; ante cualquier error, rollback de cabecera, líneas, stock y reserva.
7. Después del commit, aplica Mongo y limpia la versión consumida del carrito.

WEB/LLAMADA nacen PENDIENTE; TARREO nace COBRADA. La venta WEB queda inicialmente
atribuida al primer ADMIN activo porque el legacy requiere id_empleado. Al asignar,
PkgVentas.AsignarRepartidor cambia esa atribución al repartidor.

Las líneas no pueden repetir producto. Se rechazan productos inexistentes/inactivos,
cantidades inválidas y totales mayores al límite de NUMBER(12,2). No se usan precios
proporcionados por el cliente. Si cambia el precio desde que se agregó al carrito,
la venta usa el valor actual; revisar la respuesta final antes de continuar con la entrega.

## Estados y permisos confirmados

RECIBIDO → ASIGNADO → EN_CAMINO → ENTREGADO. No se permiten saltos ni retrocesos.
Asignar por primera vez crea ASIGNADO; reasignar mientras está ASIGNADO registra
otra entrada de historial. Repetir la misma asignación no agrega una entrada.

ENTREGADO exige metodo_pago real. PkgVentas.CobrarVenta marca COBRADA en la misma
transacción que el evento del pedido. Repetir entrega con igual método es idempotente;
con otro método devuelve 409. El método de cobro inicialmente solicitado permanece
en metodo_cobro; metodo_pago guarda el efectivamente utilizado al entregar.

Regla de cancelación acordada:

- CLIENTE: solo sus pedidos en RECIBIDO.
- ADMIN: RECIBIDO, ASIGNADO o EN_CAMINO.
- REPARTIDOR: no cancela.
- ENTREGADO es terminal y no se cancela.

Cancelar llama al procedimiento AnularVenta, conserva importes/detalles históricos,
marca ANULADA y devuelve stock. Repetir CANCELADO no repone stock otra vez ni duplica
historial. ADMIN puede eliminar el documento de un pedido CANCELADO; la cabecera,
sus detalles, la clave de idempotencia y la auditoría permanecen en Oracle.

Acceder a un pedido ajeno devuelve 404 sin exponer dirección. Cada listado también
revalida la propiedad/asignación actual en Oracle: una copia Mongo atrasada no revela
un pedido al repartidor anterior después de reasignarlo.

## Reintentos e idempotencia

Se recomienda enviar `Idempotency-Key` en los tres POST de ventas. Admite 1–100
caracteres ASCII de letras, números, punto, guion, guion bajo y dos puntos.
Una clave identifica una operación de un usuario y no se reutiliza para otra venta.
Además, Solicitud_Venta.carrito_version tiene una restricción única: la misma
versión no se puede confirmar dos veces aunque se envíen claves diferentes. En ese
caso se devuelve 409; se debe consultar el pedido original o reintentar con su clave.
Misma clave + mismo cuerpo normalizado devuelve la venta existente (HTTP 200 y
reutilizada:true); primera creación devuelve HTTP 201. Cambiar los datos con la
misma clave devuelve 409. La restricción Oracle impide duplicados concurrentes.

WEB deduplica automáticamente la versión del carrito si no se envía clave. Tras
vaciarse el carrito, para un reintento recuperable debe enviarse la clave original
que devuelve clave_idempotencia; de lo contrario se responde carrito vacío (409),
sin crear otra venta. LLAMADA/TARREO generan una clave UUID cuando no se proporciona:
para recuperar un reintento después de perder una respuesta, el cliente debe enviar
una clave propia desde el primer intento.

La clave de un pedido ya eliminado no se puede usar para recrearlo. Si falló por
stock o validación, no queda una solicitud confirmada: puede corregirse la causa
y volver a intentar con esa clave.

## Mongo después de Oracle

Los pedidos se guardan como snapshots completos con historial, versión, dinero y
pago. Los eventos PEDIDO_GUARDAR, PEDIDO_ELIMINAR y CARRITO_LIMPIAR se procesan FIFO
con el mismo sincronizador durable de FASE 2. ObjectId y fechas se convierten a
sus tipos BSON; repetir un evento no duplica documentos, historial ni auditorías.

Para validar transiciones concurrentes, cada mutación bloquea Venta y lee el último
snapshot confirmado en Pendiente_Mongo, incluso si ya fue procesado. Es un respaldo
de la proyección Mongo. Las fixtures antiguas de FASE 1 usan su documento Mongo como
punto inicial hasta que se registra su primera transición. No borrar estos snapshots
al purgar pendientes procesados sin preparar antes una alternativa de control.

Los IDs, cantidades, precios e importes se contrastan con la cabecera y los detalles
Oracle al leer o modificar un pedido; no se usan identificadores financieros o
cantidades de una copia Mongo alterada para ejecutar una cancelación.

Esto evita cobrar después de cancelar o entregar dos veces durante una caída de
Mongo. Las mutaciones devuelven sincronizacion OK/PENDIENTE y el detalle puede
consultarse desde Oracle aun si el documento nuevo todavía no llegó a Mongo.
Los listados dependen de Mongo y pueden tardar en incluir pedidos nuevos mientras
la sincronización esté pendiente; las acciones no confían en ese estado atrasado.

TARREO tiene su comprobante completo en eventos_auditoria, tipo VENTA_TARREO, con
id_venta, empleado, ítems, subtotal, descuento, total y pago. No crea un pedido de
reparto ni una quinta colección. Para revisar totales Mongo, consultar ese evento.
El stock actual sigue siendo exclusivamente Productos.stock en Oracle; los eventos
CAMBIO_STOCK registran antes/después y las cantidades de pedidos/detalles permiten
comprobar el movimiento. No se duplica un stock mutable en catálogo Mongo.

Cada venta y cancelación audita sus movimientos de stock. El rechazo por falta de
stock devuelve HTTP 409 con producto, disponible y solicitado. Después del rollback
se guarda VENTA_RECHAZADA_STOCK en una transacción independiente, para no perder la
auditoría junto a la venta fallida. Si Mongo cae, ese rechazo también queda pendiente
hasta recuperarlo. Asignación, estado, entrega, cancelación y eliminación se auditan.

La conexión Mongo usa un connect() explícito compartido entre solicitudes para
recuperar también un fallo de conexión inicial (topología cerrada del driver).
Health, lecturas y sincronizador vuelven a conectar cuando Mongo reaparece, incluso
si se reinició la API mientras Mongo seguía caído. El JWT se conserva porque su
secreto sigue en .env; el estado y los reintentos se recuperan desde Oracle.

## Ventas del día

Devuelve `{fecha,ventas,resumen}`. Incluye ítems e importes de Oracle, paginación y
el empleado al que se atribuye cada venta. El resumen abarca todos los registros
que cumplen los filtros, no solo la página devuelta; dinero, descuento y separación
EFECTIVO/TRANSFERENCIA suman únicamente COBRADAS. Pendientes y anuladas pueden verse
en el listado pero no se cuentan como dinero cobrado. Una entrega no descuenta stock
nuevamente. El rol REPARTIDOR no puede consultar ventas de otro empleado.

## Prueba manual completa

En docs/api.http, ejecutar en orden: login de los tres roles, vaciar carrito, agregar
producto 2 cantidad 2, crearPedidoWeb, asignar empleado 2, EN_CAMINO, ENTREGADO con
EFECTIVO y ventas/día. Con precios de semilla: subtotal 30.000, descuento 3.000,
total 27.000; stock del producto 2 baja en 2 al confirmar y no cambia al entregar.
Cambiar las claves de ejemplo para crear otra venta nueva; repetirlas recupera la anterior.
Después probar TARREO y consultar auditoría tipo VENTA_TARREO.

SQL Developer (usuario de aplicación, puerto de tu .env, servicio FREEPDB1):

```sql
SELECT id_venta,canal,estado_pago,metodo_pago,subtotal,descuento,total_venta,id_pedido_mongo
FROM Venta ORDER BY id_venta DESC;
SELECT id_producto,nombre,stock FROM Productos ORDER BY id_producto;
SELECT * FROM Detalle_venta ORDER BY id_detalle DESC;
SELECT estado,tipo,id_venta,intentos,ultimo_error FROM Pendiente_Mongo ORDER BY id_evento DESC;
```

Compass: gas_al_paso.pedidos para WEB/LLAMADA; eventos_auditoria para TARREO, stock
y rechazos. Comparar id_venta, cantidades, precios unitarios e importes, no el ObjectId
con el folio relacional (son identificadores diferentes).

## Pruebas automatizadas

Solo bases demo. La suite crea productos y ventas reales de prueba, registra
entregas/cancelaciones y deja auditoría histórica. No borra ventas previas ni cambia
credenciales demo. Antes de publicarlas, revisar que sean datos de desarrollo.

PowerShell:

```powershell
Get-Content -Raw api/tests/ventas.mjs | docker compose exec -T api node --input-type=module
```

Bash:

```sh
docker compose exec -T api node --input-type=module < api/tests/ventas.mjs
```

Cubre TTL y carritos privados, precio revalidado, descuento en/sobre/bajo el umbral,
flujo WEB completo, LLAMADA, TARREO, roles, historial, cancelaciones y borrado,
rollback si falla la segunda línea, auditoría de stock, doble confirmación concurrente,
competencia por el último balón, reasignación con Mongo atrasado y carrera entre
entregar/cancelar. Las secuencias pueden tener saltos por rollbacks; es normal.

## Persistencia de los datos de desarrollo

`docker compose down` conserva las bases. Después de actualizar, la API verifica
que exista Solicitud_Venta; si falta muestra cómo aplicar el actualizador. Cambiar
el código no ejecuta automáticamente scripts nuevos sobre volúmenes existentes.
Los archivos `.scripts` y `.tests` deben copiarse completos, aunque comiencen con punto.
No borrar la cola procesada: contiene el respaldo de control de los pedidos nuevos.

## Resultados verificados

- **180 comprobaciones de ventas aprobadas**, incluida una copia de carrito consumida
  que reaparece en Mongo, claves diferentes para esa versión, nuevas ediciones y
  limpieza atrasada sin borrar un carrito posterior.
- **98 comprobaciones de regresión de API base aprobadas** después de los cambios.
- **36 comprobaciones Oracle aprobadas** al preparar la instalación de prueba limpia.
- Migraciones 01–08 verificadas en una instalación aislada y actualización aditiva
  repetida sobre bases existentes, conservando datos y secuencias.
- Caída real de Mongo después de leer el carrito: WEB confirmado una sola vez,
  respuesta PENDIENTE, stock correcto y rechazo por falta de stock auditado.
- Reinicio real de la API con Mongo aún caído: mismo JWT y clave recuperaron la
  venta; se pudo asignar, pasar EN_CAMINO y cobrar ENTREGADO desde snapshots Oracle.
- Al restaurar Mongo: un único pedido, historial de cuatro estados, totales/pago
  coherentes, auditoría recuperada y carrito consumido limpio.
- Los cuatro servicios terminaron healthy; sin pendientes de sincronización.

Se usaron Oracle y Mongo reales en proyectos Docker de prueba, con clientes externos
al contenedor que se reiniciaba. Los contenedores de pruebas antiguos se retiraron
sin borrar sus volúmenes; el proyecto original no se eliminó ni se reinicializó.
No se realizaron cambios en las tablas o triggers legacy fuera de las migraciones
aditivas descritas; las ventas se crean con el package existente y una transacción.
