# FASE 1 — Bases de datos

## Instalación y preservación del legacy

El adjunto original se conserva sin modificaciones en
`db/oracle/legacy/Gas_al_Paso.sql.reference`.
El lanzador conecta por SQLPlus a FREEPDB1 como usuario de aplicación, no como SYS.
Nunca imprime credenciales. Ejecución automática de scripts ordenados:

| Script en `db/oracle/.scripts/` | Función |
| --- | --- |
| `01-legacy.sql` | Ejecuta el original, incluidos sus casos de prueba y rollback final. |
| `02-modelo.sql` | Crea Comuna, Cliente, Usuario, Repartidor_Comuna, Carga_diaria, Cierre_caja, Cierre_stock y Pendiente_Mongo; amplía Venta y Productos. |
| `03-ventas.sql` | Amplía PkgVentas y adapta triggers para las operaciones controladas. |
| `04-resumenes.sql` | Actualiza los resúmenes para contar solo ventas cobradas y confirmadas; agrega vistas de cuadratura. |
| `05-datos.sql` | Deja una sucursal, carga usuarios, comunas, productos, ventas, cargas y un cierre demo. |
| `06-verificar.sql` | Recompila dependencias y falla si existen objetos inválidos o faltan datos. |

Las pruebas originales imprimen algunos códigos ORA esperados (empleado inexistente,
stock insuficiente y bloqueo de cambios) dentro de sus manejadores de excepciones.
No indican un fallo de instalación si después aparece `FASE 1: esquema, objetos
compilados y datos de ejemplo OK` y el contenedor queda healthy.

Los scripts son **ordenados para instalación limpia**, no idempotentes sobre una
base existente. La DDL Oracle confirma implícitamente: si una instalación falla,
no es posible revertir todo el esquema con un rollback. Hay que corregir la causa
y reinicializar los volúmenes de desarrollo. El marcador de readiness se escribe
solo al completar los seis scripts.

Las carpetas `.scripts` y `.tests` se mantienen ocultas para que el entrypoint
oficial no ejecute sus SQL automáticamente como SYS ni ejecute las pruebas durante
cada arranque. Las rutas de ejecución son absolutas dentro del contenedor.
Los cambios de esquema invalidan objetos dependientes; se recompilan al final.

## Datos de ejemplo y referencias cruzadas

Una tienda; empleados 1 (admin), 2 (Camila), 3 (Diego); clientes 1–3;
ocho comunas y ocho asignaciones de cobertura; seis cuentas con bcrypt costo 12.
La contraseña demo pública está en el README; ninguna contraseña de infraestructura
se incluye en los archivos versionados.

| Producto | Precio CLP | Stock inicial | Stock tras ventas demo |
| --- | ---: | ---: | ---: |
| Gas 5kg (1) | 8.000 | 50 | 48 |
| Gas 11kg (2) | 15.000 | 40 | 38 |
| Gas 15kg (3) | 20.000 | 30 | 29 |
| Gas 45kg (4) | 55.000 | 15 | 15 |
| Regulador (5) | 4.000 | 100 | 99 |
| Manguera (6) | 3.000 | 80 | 80 |

| Venta Oracle | Pedido Mongo | Canal / estado | Subtotal / descuento / total |
| --- | --- | --- | --- |
| 1 | `650000000000000000000001` | WEB, ASIGNADO a Camila, PENDIENTE | 30.000 / 3.000 / 27.000 |
| 2 | `650000000000000000000002` | LLAMADA, RECIBIDO, PENDIENTE | 24.000 / 0 / 24.000 |
| 3 | Sin pedido | TARREO de Diego, COBRADA en efectivo | 16.000 / 0 / 16.000 |

El pedido 2 está sin repartidor; su cabecera relacional está inicialmente a nombre
del admin (Empleado es NOT NULL en el legacy). `AsignarRepartidor` permite pasar
su atribución al repartidor cuando se asigne. Las pruebas del legacy consumen
secuencias y hacen rollback; la semilla reinicia esas secuencias **antes** de crear
ventas persistentes para que los IDs demo sean reproducibles entre ambas bases.
Después, los IDs los generan las secuencias: nunca calcular `MAX(id)+1`.

El cierre demo de Diego tiene esperado/entregado $16.000, diferencia cero;
8 balones de 5 kg cargados, 2 vendidos y 6 devueltos; 2 de 45 kg cargados,
0 vendidos y 2 devueltos. Ninguna carga ni devolución declarada en un cierre
modifica Productos.stock.

## Contrato de PkgVentas

Todos los procedimientos trabajan en la transacción de la conexión llamadora:
**no hacen COMMIT**. Para una venta de varias líneas:

```sql
DECLARE
    v_id NUMBER;
BEGIN
    PkgVentas.CrearVenta(1,'WEB',1,'EFECTIVO',NULL,v_id);
    PkgVentas.AgregarItem(v_id,2,1);
    PkgVentas.AgregarItem(v_id,3,1);
    PkgVentas.FinalizarVenta(v_id);
    -- La futura API guarda también el evento Pendiente_Mongo en esta transacción.
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/
```

La API de FASE 2 usará bind variables y **una única conexión** para esos pasos,
commit al final y rollback completo ante cualquier error. No usar autoCommit por
línea. No confirmar un BORRADOR incompleto: la separación entre cabecera, ítems y
finalización exige que el llamador respete esta transacción.

- `CrearVenta(empleado, canal, cliente, metodo_pago, id_pedido_mongo, id_out)`:
  crea BORRADOR; WEB/LLAMADA requieren cliente y nacen PENDIENTE. TARREO exige
  repartidor activo, método de pago y cliente/pedido nulos; nace COBRADA.
  Para pedidos generar previamente un ObjectId en la API y pasar sus 24 caracteres
  hexadecimales, aunque Mongo se escriba después de confirmar Oracle.
- `AgregarItem(venta, producto, cantidad)`: cantidad entera positiva, producto activo,
  una línea por producto. Bloquea cabecera y producto. El trigger existente ampliado
  valida y descuenta stock. Si se repite un producto, la restricción única rechaza la línea.
- `FinalizarVenta(venta)`: exige al menos una línea; calcula el descuento sobre el
  subtotal agregado, prorratea el descuento y confirma la cabecera. El último detalle
  absorbe centavos de redondeo para mantener iguales los totales de cabecera/detalle.
- `RegistrarVenta(empleado, producto, cantidad, id_out)`: conserva la firma legacy;
  ahora representa TARREO en efectivo de una sola línea y requiere un repartidor.
- `ValidarDatos(...)`: conserva la validación legacy y rechaza productos inactivos.
- `CobrarVenta(venta, metodo_pago)`: transición controlada PENDIENTE → COBRADA,
  para la futura entrega. Repetir el mismo cobro es idempotente; cambiar un cobro
  ya registrado está prohibido. La transición del pedido a ENTREGADO será de la API.
- `AsignarRepartidor(venta, empleado)`: solo venta confirmada pendiente y repartidor activo.
- `AnularVenta(venta)` (package y procedimiento independiente): bloquea cabecera,
  devuelve el stock de todas sus líneas, cambia solo estado_pago a ANULADA y conserva
  importes y detalles. Repetir la anulación no devuelve stock dos veces. Un borrador
  se deshace con rollback, no anulándolo.

Los triggers bloquean INSERT/UPDATE/DELETE directos de cabeceras/detalles fuera de
las operaciones autorizadas. La autorización interna es una variable privada del
package con getter de solo lectura; no existe un setter público. Se limpia en éxito
y error. La excepción de anulación verifica que no se cambien otros campos.
Cobro y asignación son excepciones separadas y necesarias para el flujo de negocio;
no permiten editar los importes de ventas confirmadas.

## Control diario

`V_Cuadratura_Dinero` agrupa por empleado y fecha las ventas CONFIRMADAS y COBRADAS,
contando ventas y sumando subtotal, descuento, total, efectivo y transferencia.
Pendientes y anuladas quedan fuera de esos resúmenes.
`V_Cuadratura_Stock` une cargas con cantidades vendidas, incluso si hay ventas sin
carga; incluye solo productos cuyo peso corresponde a los balones 5, 11, 15 o 45 kg.

`Cierre_caja` permite un cierre por empleado/día; conserva totales por método y
aplica diferencia = entregado − esperado. `Cierre_stock` conserva la foto del cierre
con diferencia = vendido + devuelto − cargado; cualquier valor distinto de cero
es un descuadre (negativo: faltante; positivo: sobrante). En FASE 2 la API calculará
los esperados desde Oracle; no aceptará importes esperados calculados por el cliente.
Las cantidades son enteras no negativas y las fechas de control no contienen hora.

## MongoDB y consistencia

`init.js` crea las cuatro colecciones con validadores, índices y upserts de ejemplo.
`catalogo.id_producto` y `pedidos.id_venta` son únicos. Los pedidos tienen índices por
estado, repartidor, comuna y fecha. El carrito es único por cliente y usa índice TTL
sobre una fecha BSON, con `expireAfterSeconds: 0`. La semilla expira en 30 minutos;
la renovación en cada cambio corresponde a la API de FASE 2.
Las imágenes de catálogo son SVG propios embebidos, sin dependencias externas.
Los precios/stock actuales se leerán desde Oracle; en pedidos/carritos los precios
son snapshots y deberán revalidarse al comprar.

`Pendiente_Mongo` proporciona un registro durable para la sincronización pendiente:
id de evento, tipo, venta opcional, payload JSON, estado, intentos y último error.
La futura API insertará el evento en la misma transacción de Oracle; tras confirmar,
intentará Mongo con upsert por ObjectId/id_venta y marcará el evento PROCESADO.
Si Mongo falla, conservará la venta, registrará el error e incrementará intentos.
Un reintento consultará eventos PENDIENTE en orden y aplicará el mismo upsert.
Esta fase prepara la tabla; no incluye un worker ni endpoints de reconciliación.

No hay transacción distribuida ni FK física entre Oracle y Mongo. Las pruebas
integradas verifican IDs, líneas e importes de los datos demo de ambas bases.
La máquina de estados de pedidos y el registro de eventos de stock, precios,
asignación, cancelación y cierre se implementarán en la API de FASE 2.

## Validación

Las pruebas están en `.tests/ventas.sql` y `db/tests/verificar.mjs`. Consultar el
README para ejecutarlas desde PowerShell o Bash. Usar datos demo nuevos: las pruebas
comparan los IDs, cantidades e importes conocidos de la semilla. La suite Oracle
revierte sus cambios con rollback; la integrada limpia su carrito temporal y
revierte todas las transacciones Oracle, incluyendo las dos conexiones concurrentes.

### Resultados verificados en el entorno cloud

- Proyecto Docker aislado con volúmenes nuevos: instalación completa 01–06 y los
  cuatro servicios healthy, sin borrar los datos del proyecto de FASE 0 existente.
- `down -v` y `up -d --build` repetidos sobre ese proyecto de prueba: instalación
  completa desde cero, sin intervención manual ni objetos inválidos.
- Suite Oracle: **36 comprobaciones aprobadas**.
- Suite integrada: **30 comprobaciones aprobadas**, incluidas dos sesiones Oracle
  concurrentes y eliminación real por TTL (no solo existencia del índice).
- Seis hashes bcrypt distintos, costo 12, contrastados con la contraseña demo
  documentada y los valores guardados en Oracle.
- Semilla Mongo ejecutada nuevamente: sin duplicados.
- Reinicio de Oracle/Mongo sin borrar volúmenes: usuarios, ventas y catálogo
  conservados; cuatro servicios healthy y API health HTTP 200.
- Legacy original verificado byte por byte contra el archivo adjunto.
- Conexiones verificadas con los drivers desde la API; SQL Developer y Compass
  requieren la prueba manual en el computador del usuario según el README.

En cloud se utilizó la CA del proxy como secreto BuildKit y puertos externos
omitidos en el proyecto aislado para evitar conflictos con servicios existentes.
El Compose entregado publica Oracle 1522 y Mongo 27017 por defecto; permite
sobrescribir ambos puertos mediante `.env` sin cambiar la red interna.
