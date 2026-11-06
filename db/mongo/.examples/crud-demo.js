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
