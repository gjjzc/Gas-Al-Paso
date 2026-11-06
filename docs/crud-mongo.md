# CRUD MongoDB — ejemplos ejecutables

Estos ejemplos muestran **Create, Read, Update y Delete** sobre las colecciones
`catalogo`, `pedidos` y `carritos`, usando la misma estructura del proyecto.
Se ejecutan en **gas_al_paso_crud_demo**, una base separada. No cambian gas_al_paso,
no descuentan stock ni crean ventas Oracle. Los IDs 901 son ficticios y no se usan
como ventas reales. Las modificaciones de negocio deben hacerse por la API para
respetar Oracle primero, permisos, triggers y auditoría.

## Ejecutar desde PowerShell, Bash o la terminal de VS Code

Desde la carpeta con docker-compose.yml y con Mongo healthy:

```sh
docker compose exec -T mongo mongosh --quiet --file /docker-entrypoint-initdb.d/.examples/crud-demo.js
```

El script reutiliza las variables de autenticación del contenedor sin imprimir
contraseñas. No hay claves escritas en el archivo ni que pegar en la terminal.
También puede cargarse en una sesión mongosh autenticada mediante `load(ruta)`.
La carpeta `.examples` no se ejecuta durante la inicialización de Mongo.

Puede repetirse: solo limpia los tres documentos marcados `demo:true` con sus IDs
fijos antes de empezar, y los elimina al terminar. Conserva las colecciones e índices
de la base de demostración. No utiliza dropDatabase, drop ni borrados generales.

## Script completo

Archivo: `db/mongo/.examples/crud-demo.js`.

- **Create**: insertOne devuelve acknowledged e insertedId.
- **Read**: findOne con filtros y proyecciones; tras borrar devuelve null.
- **Update**: updateOne usa $set y, en pedidos, $push para el historial.
- **Delete**: deleteOne usa un ID exacto y la marca demo; pedidos exige CANCELADO.
- **Carritos**: la actualización renueva actualizado_en y expira_en por 30 minutos;
  el índice TTL usa expireAfterSeconds:0. No se espera al monitor TTL para demostrar
  Delete: se usa deleteOne explícitamente.
- **Catálogo**: se modifica contenido, sin duplicar precio/stock que pertenecen a Oracle.

```javascript
// Ejecutar explicitamente con mongosh. Usa otra base: NO altera gas_al_paso.
if (process.env.MONGO_INITDB_ROOT_USERNAME && process.env.MONGO_INITDB_ROOT_PASSWORD) {
  db.getSiblingDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);
}
const demo = db.getSiblingDB('gas_al_paso_crud_demo');
function salida(etiqueta, valor) { print(etiqueta + ': ' + JSON.stringify(valor)); }
function cambio(resultado) { return { matchedCount: resultado.matchedCount, modifiedCount: resultado.modifiedCount }; }
const idCatalogo = ObjectId('660000000000000000000001');
const idPedido = ObjectId('660000000000000000000002');
const idCarrito = ObjectId('660000000000000000000003');
// Repetible tras una interrupcion: solo limpia nuestros tres documentos marcados.
for (const [nombre, id] of [['catalogo',idCatalogo],['pedidos',idPedido],['carritos',idCarrito]]) {
  demo.getCollection(nombre).deleteOne({ _id: id, demo: true });
}
demo.catalogo.createIndex({ id_producto: 1 }, { unique: true });
demo.pedidos.createIndex({ id_venta: 1 }, { unique: true });
demo.carritos.createIndex({ id_cliente: 1 }, { unique: true });
demo.carritos.createIndex({ expira_en: 1 }, { expireAfterSeconds: 0 });
const ahora = new Date();
let r = demo.catalogo.insertOne({ _id: idCatalogo, demo: true, id_producto: 901,
  nombre: 'Gas demo 5 kg', categoria: 'GAS', descripcion: 'Producto ficticio',
  imagen: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
  atributos: { peso_kg: 5 }, destacado: false, activo: true });
salida('CREATE catalogo', { acknowledged: r.acknowledged, insertedId: r.insertedId.toHexString() });
salida('READ catalogo', demo.catalogo.findOne({ _id: idCatalogo }, { _id: 0, id_producto: 1, nombre: 1, categoria: 1, destacado: 1 }));
salida('UPDATE catalogo', cambio(demo.catalogo.updateOne({ _id: idCatalogo }, { $set: { destacado: true, descripcion: 'Descripcion editada' } })));
salida('READ catalogo editado', demo.catalogo.findOne({ _id: idCatalogo }, { _id: 0, descripcion: 1, destacado: 1 }));
salida('DELETE catalogo', demo.catalogo.deleteOne({ _id: idCatalogo, demo: true }));
salida('READ catalogo eliminado', demo.catalogo.findOne({ _id: idCatalogo }));

r = demo.pedidos.insertOne({ _id: idPedido, demo: true, id_venta: 901, canal: 'WEB',
  cliente: { id_cliente: 901, nombre: 'Cliente demo', telefono: '+56900000901' },
  direccion_entrega: { calle: 'Calle Demo', numero: '901', comuna: 'Santiago', referencia: 'Direccion ficticia' },
  metodo_cobro: 'EFECTIVO', items: [{ id_producto: 901, nombre: 'Gas demo', cantidad: 2, precio_unitario: 15000 }],
  subtotal: 30000, descuento: 3000, total: 27000, estado: 'RECIBIDO', repartidor: null,
  historial_estados: [{ estado: 'RECIBIDO', fecha: ahora, por: 901 }], creado_en: ahora });
salida('CREATE pedidos', { acknowledged: r.acknowledged, insertedId: r.insertedId.toHexString() });
salida('READ pedidos', demo.pedidos.findOne({ _id: idPedido }, { _id: 0, id_venta: 1, total: 1, estado: 1 }));
salida('UPDATE pedidos', cambio(demo.pedidos.updateOne({ _id: idPedido }, {
  $set: { estado: 'CANCELADO' }, $push: { historial_estados: { estado: 'CANCELADO', fecha: new Date(), por: 901 } },
})));
const pedidoEditado = demo.pedidos.findOne({ _id: idPedido });
salida('READ pedidos editado', { estado: pedidoEditado.estado, cambios_historial: pedidoEditado.historial_estados.length });
salida('DELETE pedidos', demo.pedidos.deleteOne({ _id: idPedido, demo: true, estado: 'CANCELADO' }));
salida('READ pedidos eliminado', demo.pedidos.findOne({ _id: idPedido }));

r = demo.carritos.insertOne({ _id: idCarrito, demo: true, id_cliente: 901,
  items: [{ id_producto: 901, nombre: 'Gas demo', cantidad: 2, precio_unitario: 15000 }],
  actualizado_en: ahora, expira_en: new Date(ahora.getTime()+1800000) });
salida('CREATE carritos', { acknowledged: r.acknowledged, insertedId: r.insertedId.toHexString() });
const carrito = demo.carritos.findOne({ _id: idCarrito });
salida('READ carritos', { id_cliente: carrito.id_cliente, cantidad: carrito.items[0].cantidad });
const modificadoEn = new Date();
salida('UPDATE carritos', cambio(demo.carritos.updateOne({ _id: idCarrito }, { $set: {
  'items.0.cantidad': 3, actualizado_en: modificadoEn, expira_en: new Date(modificadoEn.getTime()+1800000),
} })));
const carritoEditado = demo.carritos.findOne({ _id: idCarrito });
salida('READ carritos editado', { cantidad: carritoEditado.items[0].cantidad,
  ttl_minutos: (carritoEditado.expira_en-carritoEditado.actualizado_en)/60000 });
salida('DELETE carritos', demo.carritos.deleteOne({ _id: idCarrito, demo: true }));
salida('READ carritos eliminado', demo.carritos.findOne({ _id: idCarrito }));
print('CRUD DEMO OK: tres colecciones demostradas; documentos demo eliminados.');
```

## Salida de ejemplo verificada

Salida real de la ejecución, repetida sin duplicados:

```text
CREATE catalogo: {"acknowledged":true,"insertedId":"660000000000000000000001"}
READ catalogo: {"id_producto":901,"nombre":"Gas demo 5 kg","categoria":"GAS","destacado":false}
UPDATE catalogo: {"matchedCount":1,"modifiedCount":1}
READ catalogo editado: {"descripcion":"Descripcion editada","destacado":true}
DELETE catalogo: {"acknowledged":true,"deletedCount":1}
READ catalogo eliminado: null
CREATE pedidos: {"acknowledged":true,"insertedId":"660000000000000000000002"}
READ pedidos: {"id_venta":901,"total":27000,"estado":"RECIBIDO"}
UPDATE pedidos: {"matchedCount":1,"modifiedCount":1}
READ pedidos editado: {"estado":"CANCELADO","cambios_historial":2}
DELETE pedidos: {"acknowledged":true,"deletedCount":1}
READ pedidos eliminado: null
CREATE carritos: {"acknowledged":true,"insertedId":"660000000000000000000003"}
READ carritos: {"id_cliente":901,"cantidad":2}
UPDATE carritos: {"matchedCount":1,"modifiedCount":1}
READ carritos editado: {"cantidad":3,"ttl_minutos":30}
DELETE carritos: {"acknowledged":true,"deletedCount":1}
READ carritos eliminado: null
CRUD DEMO OK: tres colecciones demostradas; documentos demo eliminados.
```

En Compass puedes abrir `gas_al_paso_crud_demo` para ver las tres colecciones y sus índices.
Quedarán vacías porque el script completa sus Delete; para ver los documentos
intermedios, ejecutar los bloques Create/Read/Update por separado en mongosh.
