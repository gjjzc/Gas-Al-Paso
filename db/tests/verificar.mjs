// Ejecutar desde /app en el contenedor API (ver README). Solo usa bases de desarrollo.
import assert from 'node:assert/strict';
import oracledb from 'oracledb';
import { oraclePool, mongoDb, mongoClient } from './src/config/databases.js';

let comprobaciones = 0;
function comprobar(condicion, mensaje) {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
}
const conexiones = [];
async function conexion() {
  const c = await oraclePool.getConnection();
  c.callTimeout = 15000;
  conexiones.push(c);
  return c;
}
async function escalar(c, sql, binds = {}) {
  return (await c.execute(sql, binds)).rows[0][0];
}
async function crear(c) {
  const r = await c.execute(
    "BEGIN PkgVentas.CrearVenta(1,'WEB',3,NULL,NULL,:id); END;",
    { id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
  );
  return r.outBinds.id;
}
const carritoPrueba = 999999;
try {
  const c = await conexion();
  comprobar(await escalar(c, "SELECT COUNT(*) FROM user_objects WHERE status='INVALID'") === 0, 'Objetos compilados');
  comprobar(await escalar(c, 'SELECT COUNT(*) FROM Comuna') === 8, 'Ocho comunas');
  comprobar(await escalar(c, 'SELECT COUNT(*) FROM Usuario') === 6, 'Seis usuarios');
  comprobar(await escalar(c, 'SELECT COUNT(*) FROM Tienda') === 1, 'Una sucursal');
  comprobar((await mongoDb.listCollections().toArray()).length === 4, 'Cuatro colecciones Mongo');
  const catalogo = await mongoDb.collection('catalogo').find().toArray();
  comprobar(catalogo.length === 6, 'Seis documentos de catalogo');
  for (const producto of catalogo) {
    comprobar(await escalar(c, 'SELECT COUNT(*) FROM Productos WHERE id_producto=:id', { id: producto.id_producto }) === 1,
      `Referencia de catalogo ${producto.id_producto}`);
  }
  const pedidos = await mongoDb.collection('pedidos').find().toArray();
  comprobar(pedidos.length === 2, 'Dos pedidos de ejemplo');
  for (const pedido of pedidos) {
    const venta = (await c.execute(
      'SELECT id_pedido_mongo,subtotal,descuento,total_venta,canal,id_cliente FROM Venta WHERE id_venta=:id',
      { id: pedido.id_venta },
    )).rows[0];
    assert.deepEqual(venta, [pedido._id.toHexString(), pedido.subtotal, pedido.descuento, pedido.total, pedido.canal, pedido.cliente.id_cliente]);
    comprobaciones += 1;
    const items = (await c.execute(
      'SELECT id_producto,cantidad,precio_unitario FROM Detalle_venta WHERE id_venta=:id ORDER BY id_producto',
      { id: pedido.id_venta },
    )).rows;
    assert.deepEqual(items, pedido.items.map(i => [i.id_producto, i.cantidad, i.precio_unitario]).sort((a,b) => a[0]-b[0]));
    comprobaciones += 1;
  }
  const indices = await mongoDb.collection('pedidos').indexes();
  for (const campo of ['estado', 'repartidor.id_empleado', 'direccion_entrega.comuna', 'creado_en']) {
    comprobar(indices.some(i => campo in i.key), `Indice de pedidos: ${campo}`);
  }
  const ttl = (await mongoDb.collection('carritos').indexes()).find(i => i.name === 'ttl_carrito');
  comprobar(ttl?.expireAfterSeconds === 0 && ttl.key.expira_en === 1, 'Indice TTL');

  await assert.rejects(mongoDb.collection('carritos').insertOne({
    id_cliente: 999998, items: [{ id_producto: 1, nombre: 'Gas', cantidad: 0, precio_unitario: 8000 }],
    actualizado_en: new Date(), expira_en: new Date(),
  }), e => e.code === 121);
  comprobaciones += 1;
  await assert.rejects(mongoDb.collection('pedidos').updateOne({ id_venta: 1 }, { $set: { estado: 'INVENTADO' } }), e => e.code === 121);
  comprobaciones += 1;

  // Un fallo en la segunda linea se revierte desde la misma conexion.
  const stockAntes = await escalar(c, 'SELECT stock FROM Productos WHERE id_producto=2');
  const ventasAntes = await escalar(c, 'SELECT COUNT(*) FROM Venta');
  const id = await crear(c);
  await c.execute('BEGIN PkgVentas.AgregarItem(:id,2,1); END;', { id });
  await assert.rejects(c.execute('BEGIN PkgVentas.AgregarItem(:id,4,99999); END;', { id }), e => e.errorNum === 20003);
  await c.rollback();
  comprobar(await escalar(c, 'SELECT stock FROM Productos WHERE id_producto=2') === stockAntes, 'Rollback restaura primera linea');
  comprobar(await escalar(c, 'SELECT COUNT(*) FROM Venta') === ventasAntes, 'Rollback elimina cabecera parcial');

  // Dos sesiones compiten por el mismo producto. La segunda debe esperar el bloqueo.
  const c1 = await conexion();
  const c2 = await conexion();
  const disponible = await escalar(c, 'SELECT stock FROM Productos WHERE id_producto=4');
  const id1 = await crear(c1);
  const id2 = await crear(c2);
  await c1.execute('BEGIN PkgVentas.AgregarItem(:id,4,:cantidad); END;', { id: id1, cantidad: disponible });
  let termino = false;
  const segunda = c2.execute('BEGIN PkgVentas.AgregarItem(:id,4,:cantidad); END;', { id: id2, cantidad: disponible })
    .then(r => { termino = true; return r; });
  await new Promise(resolve => setTimeout(resolve, 300));
  comprobar(!termino, 'Segunda sesion espera el bloqueo de stock');
  await c1.rollback();
  await segunda;
  comprobar(await escalar(c2, 'SELECT stock FROM Productos WHERE id_producto=4') === 0, 'Segunda sesion descuenta una vez');
  await c2.rollback();
  comprobar(await escalar(c, 'SELECT stock FROM Productos WHERE id_producto=4') === disponible, 'Rollback concurrente conserva stock');
  console.log('Oracle, consistencia de fixtures e indices Mongo: OK');

  // Prueba real del monitor TTL, que es asincrono (normalmente hasta 60 segundos).
  await mongoDb.collection('carritos').insertOne({
    id_cliente: carritoPrueba, items: [], actualizado_en: new Date(), expira_en: new Date(Date.now()-60000),
  });
  console.log('Esperando eliminacion TTL del carrito de prueba...');
  const limite = Date.now()+90000;
  while (await mongoDb.collection('carritos').countDocuments({ id_cliente: carritoPrueba })) {
    assert.ok(Date.now() < limite, 'El monitor TTL no elimino el documento en 90 segundos');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  comprobaciones += 1;
  console.log(`PRUEBAS INTEGRADAS OK: ${comprobaciones} comprobaciones; TTL real verificado.`);
} finally {
  await mongoDb.collection('carritos').deleteOne({ id_cliente: carritoPrueba }).catch(() => {});
  for (const c of conexiones) {
    await c.rollback().catch(() => {});
    await c.close().catch(() => {});
  }
  await Promise.allSettled([mongoClient.close(), oraclePool.close(0)]);
}
