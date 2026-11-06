# FASE 4 — Control diario

Cargas acumulativas, cierre del repartidor, cuadratura de dinero por método y de
balones por producto, y consulta de auditoría. El frontend todavía se prueba mediante
los endpoints y ejemplos de `docs/api.http`; esta fase no agrega pantallas.

## Actualizar desde FASE 3 sin borrar las bases

Conservar `.env`, JWT_SECRET y los puertos que ya funcionaban. Copiar el ZIP sobre
la carpeta Git, en la rama `fase-4-control-diario`, y ejecutar desde la raíz:

```powershell
docker compose exec -T oracle bash /container-entrypoint-initdb.d/.scripts/aplicar-control.sh
docker compose up -d --build api
docker compose up -d
docker compose ps
```

**No ejecutar down -v ni el legacy.** El actualizador aplica 07, 08 y 09 de manera
idempotente. Agrega Venta.fecha_cobro, un trigger para capturar el momento del cobro,
la tabla Solicitud_Control y un índice. Reemplaza las vistas y resúmenes del dinero
para usar fecha_cobro. No reinicia secuencias, no borra ventas y no cambia cierres previos.
El inicio nuevo ejecuta 01–09. La API avisa si falta la migración.

Las ventas históricas que ya estaban COBRADAS no tenían la fecha real de cobro.
Se conserva su información y se usa fecha_venta como referencia cuando fecha_cobro
es NULL; no se inventa retrospectivamente una fecha de entrega. Las ventas nuevas
TARREO registran fecha_cobro al crearse y WEB/LLAMADA al pasar a COBRADA mediante
la entrega. Reintentar una entrega no mueve esa fecha. Los días usan el calendario
de Oracle/SYSDATE del contenedor; las fechas de filtro son AAAA-MM-DD.

## Contratos HTTP

| Método y ruta | Rol | Uso |
| --- | --- | --- |
| `POST /cargas` | ADMIN | Suma una carga/recarga por empleado, fecha y producto. |
| `GET /cargas?fecha=&id_empleado=` | ADMIN | Cantidades acumuladas; fecha opcional, predeterminado hoy. |
| `POST /cierre` | REPARTIDOR | Guarda su cierre y los detalles de devolución en una transacción. |
| `GET /cuadratura?fecha=&id_empleado=` | ADMIN | Reporte de repartidores, dinero, balones, pendientes y alertas. |
| `GET /auditoria` | ADMIN | Filtros opcionales tipo, fecha UTC, id_usuario, id_empleado, limite y offset. |

### Carga diaria

```json
{
  "id_empleado": 2,
  "fecha": "2026-11-06",
  "items": [
    {"id_producto": 2, "cantidad_cargada": 4},
    {"id_producto": 3, "cantidad_cargada": 2}
  ]
}
```

`fecha` es opcional. Cada POST **suma**, no sustituye. ADMIN puede preparar cargas
para fechas futuras. Hasta 100 productos distintos, cantidades enteras positivas.
Solo repartidores activos y balones activos de 5/11/15/45 kg del modelo Oracle.
No cargar accesorios. No se descuentan ni aumentan existencias de Productos: es un
registro de control independiente del stock global. Si una línea falla se revierte
toda la carga. Después del cierre de esa fecha no se permiten recargas.

Respuesta HTTP 201: fecha, empleado y líneas con cantidad_agregada y cantidad_cargada
acumulada. GET devuelve `{fecha,cargas:[...]}` y no oculta registros históricos de
productos o trabajadores que luego se desactivaron.

### Cierre del repartidor

```json
{
  "entregado_efectivo": 27000,
  "entregado_transferencia": 20000,
  "devueltos": [
    {"id_producto": 2, "devuelto": 2},
    {"id_producto": 3, "devuelto": 1}
  ],
  "observacion": "Conteo de fin de jornada"
}
```

`fecha` es opcional; puede ser hoy o una fecha pasada, no futura. No se admite
id_empleado: siempre se usa el empleado del JWT. Tampoco se reciben importes esperados,
stock cargado ni vendido: todos se calculan en Oracle. Montos no negativos, hasta dos
decimales; devueltos enteros no negativos. Debe declararse cada producto cargado o
vendido, **aunque devuelto sea cero**. Un balón adicional devuelto sin carga genera
su propia diferencia, no se oculta. No se modifican existencias al declarar devoluciones.

Antes de cerrar se exige que no quede ninguna venta WEB/LLAMADA propia confirmada
PENDIENTE, de ninguna fecha. Una asignación está ligada al empleado en Oracle, así
que el chequeo funciona aunque Mongo esté atrasado o caído. Pedidos ajenos no bloquean
el cierre. Resolver los propios mediante entrega/cobro o cancelación autorizada.

Se guardan Cierre_caja y todas las filas Cierre_stock, más el evento durable de auditoría,
en **una transacción**. Cualquier error hace rollback de todo. Un cierre con diferencia
se registra igualmente: la diferencia debe poder revisarse, no esconderse impidiendo
el registro. La respuesta tiene estado CUADRADO o DESCUADRE.

Un cierre por empleado/fecha. Después no se aceptan nuevas cargas, asignaciones,
cambios de estado de trabajo ni ventas TARREO de ese repartidor para el día cerrado.
Los reintentos idempotentes de operaciones ya realizadas sí recuperan su respuesta;
las cancelaciones de pendientes heredados siguen permitidas según las reglas de
FASE 3. Cambios y cierres se coordinan con el bloqueo de la misma fila Empleado,
evitando que una venta o recarga entre por detrás de un cierre concurrente.
No se implementan reaperturas ni edición de cierres en esta fase.

## Cuadratura

Devuelve `{fecha,repartidores,resumen}`. Incluye repartidores actuales y trabajadores
con cargas, cobros o cierre para la fecha, aunque luego cambiasen de rol o se desactivasen.

Dinero:

- Esperado: suma de ventas CONFIRMADAS y COBRADAS en **fecha de cobro**, usando sus
  totales tras descuento. Incluye accesorios; excluye pendientes y anuladas.
- Entregado: declaración del cierre, por EFECTIVO y TRANSFERENCIA.
- Diferencia: entregado − esperado, tanto por método como en total.
- Un valor negativo indica faltante y positivo un excedente. **Neto cero no oculta
  diferencias entre métodos**: efectivo -1000 y transferencia +1000 sigue siendo DESCUADRE.

Balones, por producto:

- Cargado: suma registrada en Carga_diaria.
- Vendido: cantidades de Detalle_venta de las ventas cobradas ese día.
- Devuelto: declaración de Cierre_stock; cero explícito cuando no volvió ninguno.
- Diferencia: vendido + devuelto − cargado. Distinto de cero marca descuadre;
  negativo significa que faltan unidades para justificar la carga; positivo indica
  más vendido/devuelto que lo cargado, por ejemplo venta sin carga registrada.

Antes de cerrar, estado ABIERTO: se muestran esperados y cantidades, pero entregado,
devuelto y diferencias son null. No se interpreta como falta lo que aún no se declaró.
Después, estado CUADRADO si todo coincide; DESCUADRE si falla dinero o algún producto.

Ejemplos:

| Caso | Dinero esperado / entregado | Cargado / vendido / devuelto | Resultado |
| --- | --- | --- | --- |
| Correcto | 27.000 / 27.000 | 4 / 2 / 2 | Dinero 0, balones 0, CUADRADO |
| Falta dinero | 27.000 / 26.000 | 4 / 2 / 2 | Dinero -1.000, DESCUADRE |
| Falta un balón | 27.000 / 27.000 | 4 / 2 / 1 | Balones -1, DESCUADRE |

El reporte calcula contra ventas/cargas Oracle actuales, conservando en `cierre`
los valores registrados originalmente. Si un cierre antiguo fue seguido por ventas
cuando todavía no existía este bloqueo, o se alteraron datos directamente en SQL,
`cierre.desactualizado` lo advierte y se marca DESCUADRE; no se presenta un cero falso.
Los reportes ven una transacción READ ONLY consistente entre sus consultas.

## Idempotencia y auditoría

Se recomienda Idempotency-Key en POST /cargas y POST /cierre. Misma clave y cuerpo
normalizado del mismo usuario recupera la operación original con HTTP 200,
reutilizada:true; primera creación HTTP 201. La clave no se reutiliza para otra operación.
Sin header se genera UUID, pero un cliente que perdió la respuesta necesita haber
enviado su propia clave para recuperarla. Así un reintento no duplica una recarga.

CARGA_DIARIA registra cada carga efectiva y su acumulado; CIERRE_CAJA guarda dinero,
balones y alertas. Oracle se confirma primero junto a Pendiente_Mongo y después se
escribe eventos_auditoria. Una caída Mongo devuelve sincronizacion:PENDIENTE sin
perder el cierre. El sincronizador reintenta automáticamente, o ADMIN llama
POST /sincronizacion/reintentar. No se guardan contraseñas ni JWT en los eventos.

## Demostración y pruebas

Usar el bloque FASE 4 de docs/api.http. Se crea un repartidor nuevo porque las
cuentas demo existentes pueden tener pendientes o un cierre ya guardado. Ejecutar
loginAdmin, crearRepControl, loginControl, carga, recarga, venta, cuadratura abierta,
cierre y cuadratura final. Para otro caso usar otro repartidor y claves nuevas.

Suite de desarrollo (crea movimientos y cierres ficticios, conserva historia):

```powershell
Get-Content -Raw api/tests/control.mjs | docker compose exec -T api node --input-type=module
```

No ejecutarla sobre producción. Requiere las cuentas demo y una base accesible.
La suite crea productos y empleados propios y no cierra las cuentas demo existentes.
La suite de FASE 3 ahora usa un repartidor alternativo abierto para competir por stock:
Diego tiene un cierre de ejemplo y ya no puede registrar ventas nuevas ese día.

SQL Developer:

```sql
SELECT id_venta, fecha_venta, fecha_cobro, estado_pago, metodo_pago, total_venta
FROM Venta ORDER BY id_venta DESC;
SELECT * FROM Carga_diaria ORDER BY fecha DESC, id_empleado;
SELECT * FROM Cierre_caja ORDER BY id_cierre DESC;
SELECT * FROM Cierre_stock ORDER BY id_cierre DESC, id_producto;
SELECT * FROM V_Cuadratura_Dinero;
SELECT * FROM V_Cuadratura_Stock;
```

Para ejemplos Mongo CRUD aislados, ver docs/crud-mongo.md y ejecutar:

```powershell
docker compose exec -T mongo mongosh --quiet --file /docker-entrypoint-initdb.d/.examples/crud-demo.js
```

## Validación realizada

Instalación nueva con los cuatro servicios saludables y migración repetida sin errores.
Suites: bases 36 comprobaciones, API base 98, ventas 181 y control diario 123.
Se verificaron cierre cuadrado, faltante de dinero, faltante de balones, diferencias
por método aunque el total sea igual, recargas, reintentos y concurrencia con cierre.
Prueba real con Mongo detenido: Oracle guarda el cierre con auditoría pendiente;
al recuperar Mongo aparece un único evento y se conserva diferencia cero.
El ejemplo CRUD se ejecutó dos veces en su base aislada sin modificar los pedidos reales.
