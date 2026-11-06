// Pruebas financieras de FASE 3. Solo datos demo: crea ventas reales de prueba.
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { oraclePool, mongoClient, mongoDb } from './src/config/databases.js';
import { encolar } from './src/services/sincronizacion.js';
const base = 'http://127.0.0.1:4000/api';
const marca = Date.now();
let comprobaciones = 0;
async function peticion(metodo, ruta, datos, token, clave) {
  const r = await fetch(base+ruta, { method: metodo, headers: {
    ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(clave ? { 'Idempotency-Key': clave } : {}),
  }, body: datos === undefined ? undefined : JSON.stringify(datos), signal: AbortSignal.timeout(30000) });
  return { estado: r.status, cuerpo: await r.json() };
}
async function pedir(metodo, ruta, datos, token, estado = 200, clave) {
  const r = await peticion(metodo, ruta, datos, token, clave);
  assert.equal(r.estado, estado, `${metodo} ${ruta}: ${JSON.stringify(r.cuerpo)}`);
  comprobaciones += 1;
  return r.cuerpo;
}
function comprobar(condicion, texto) { assert.ok(condicion, texto); comprobaciones += 1; }
async function sql(sentencia, binds = {}) {
  const c = await oraclePool.getConnection();
  try { return (await c.execute(sentencia, binds)).rows; }
  finally { await c.close(); }
}
async function stock(id) { return (await sql('SELECT stock FROM Productos WHERE id_producto=:id', { id }))[0][0]; }
const direccion = { calle: 'Calle Prueba', numero: '10', id_comuna: 1, referencia: 'Datos ficticios' };
const confirmar = { direccion_entrega: direccion, metodo_cobro: 'EFECTIVO' };
let admin, ana, bruno, camila, diego;
async function login(email) { return (await pedir('POST', '/auth/login', { email, password: 'GasPasoDemo2026!' })).token; }
async function producto(nombre, precio, cantidad) {
  return pedir('POST', '/catalogo', { nombre: `F3 ${nombre} ${marca}`, descripcion: 'Producto de prueba FASE 3',
    categoria: 'GAS', peso: 5, precio, stock: cantidad }, admin, 201);
}
async function telefono(cliente, items, clave) {
  return pedir('POST', '/pedidos/telefonico', { id_cliente: cliente, items, direccion_entrega: direccion, metodo_cobro: 'TRANSFERENCIA' }, admin, 201, clave);
}
async function compararPedido(pedido) {
  const fila = (await sql('SELECT subtotal,descuento,total_venta,estado_pago,id_empleado FROM Venta WHERE id_venta=:id', { id: pedido.id_venta }))[0];
  const mongo = await mongoDb.collection('pedidos').findOne({ _id: new ObjectId(pedido._id) });
  assert.deepEqual(fila.slice(0,4), [mongo.subtotal,mongo.descuento,mongo.total,mongo.estado_pago]);
  comprobaciones += 1;
  const detalles = await sql('SELECT id_producto,cantidad,precio_unitario FROM Detalle_venta WHERE id_venta=:id ORDER BY id_producto', { id: pedido.id_venta });
  assert.deepEqual(detalles, mongo.items.map(i => [i.id_producto,i.cantidad,i.precio_unitario]).sort((a,b) => a[0]-b[0]));
  comprobaciones += 1;
  comprobar(mongo.estado === pedido.estado && mongo.historial_estados.at(-1).estado === pedido.estado, 'Historial y estado Mongo coherentes');
}
try {
  admin = await login('admin@demo.gasalpaso.test');
  ana = await login('ana@demo.gasalpaso.test');
  bruno = await login('bruno@demo.gasalpaso.test');
  camila = await login('camila@demo.gasalpaso.test');
  diego = await login('diego@demo.gasalpaso.test');
  const p1 = await producto('A', 15000, 30);
  const p2 = await producto('B', 20000, 20);
  await pedir('GET', '/carrito', undefined, undefined, 401);
  await pedir('GET', '/carrito', undefined, admin, 403);
  await pedir('GET', '/carrito', undefined, camila, 403);
  await pedir('DELETE', '/carrito', undefined, ana);
  await pedir('DELETE', '/carrito', undefined, bruno);
  const c1 = await pedir('POST', '/carrito/items', { id_producto: p1.id_producto, cantidad: 1 }, ana);
  comprobar(new Date(c1.expira_en)-new Date(c1.actualizado_en) === 1800000, 'TTL de 30 minutos');
  const lectura = await pedir('GET', '/carrito', undefined, ana);
  comprobar(lectura.expira_en === c1.expira_en, 'Leer no renueva TTL');
  const c2 = await pedir('POST', '/carrito/items', { id_producto: p1.id_producto, cantidad: 1 }, ana);
  comprobar(c2.items[0].cantidad === 2 && c2.version !== c1.version, 'Agregar acumula y cambia version');
  comprobar(await stock(p1.id_producto) === 30, 'El carrito no reserva stock');
  await pedir('PATCH', `/carrito/items/${p1.id_producto}`, { cantidad: 3 }, ana);
  const listo = await pedir('PATCH', `/carrito/items/${p1.id_producto}`, { cantidad: 2 }, ana);
  comprobar(listo.total === 27000 && listo.descuento === 3000, 'Descuento del carrito en umbral exacto');
  await pedir('PATCH', `/carrito/items/${p1.id_producto}`, { cantidad: 0 }, ana, 400);
  await pedir('POST', '/carrito/items', { id_producto: p2.id_producto, cantidad: 1, precio_unitario: 1 }, ana, 400);
  await pedir('POST', '/carrito/items', { id_producto: p2.id_producto, cantidad: 1 }, ana);
  await pedir('DELETE', `/carrito/items/${p2.id_producto}`, undefined, ana);
  await pedir('DELETE', `/carrito/items/${p2.id_producto}`, undefined, ana, 404);
  await pedir('POST', '/carrito/items', { id_producto: p2.id_producto, cantidad: 1 }, bruno);
  comprobar((await pedir('GET', '/carrito', undefined, ana)).items.length === 1, 'Carritos aislados por cliente');

  const web = await pedir('POST', '/pedidos', confirmar, ana, 201, `web-${marca}`);
  comprobar(web.estado === 'RECIBIDO' && web.estado_pago === 'PENDIENTE' && web.subtotal === 30000 && web.descuento === 3000 && web.total === 27000, 'Alta WEB y descuento Oracle');
  comprobar(web.sincronizacion === 'OK' && await stock(p1.id_producto) === 28, 'Stock descontado al crear');
  await compararPedido(web);
  const repetida = await pedir('POST', '/pedidos', confirmar, ana, 200, `web-${marca}`);
  comprobar(repetida.id_venta === web.id_venta && repetida.reutilizada && await stock(p1.id_producto) === 28, 'Reintento WEB no duplica venta');
  await pedir('POST', '/pedidos', { ...confirmar, metodo_cobro: 'TRANSFERENCIA' }, ana, 409, `web-${marca}`);
  comprobar((await pedir('GET', '/carrito', undefined, ana)).items.length === 0, 'Checkout limpia carrito consumido');
  await pedir('POST', '/carrito/items', { id_producto: p2.id_producto, cantidad: 1 }, ana);
  await pedir('POST', '/pedidos', confirmar, ana, 200, `web-${marca}`);
  comprobar((await pedir('GET', '/carrito', undefined, ana)).items[0].id_producto === p2.id_producto, 'Reintento conserva carrito nuevo');
  comprobar((await pedir('GET', '/pedidos/mios', undefined, ana)).some(p => p._id === web._id), 'Listado propio');
  comprobar((await pedir('GET', '/pedidos?estado=RECIBIDO&comuna=1', undefined, admin)).some(p => p._id === web._id), 'Filtro admin por estado y comuna');
  await pedir('GET', `/pedidos/${web._id}`, undefined, bruno, 404);
  await pedir('GET', `/pedidos/${web._id}`, undefined, camila, 404);
  await pedir('GET', '/pedidos', undefined, ana, 403);
  await pedir('PATCH', `/pedidos/${web._id}/asignar`, { id_empleado: 2 }, ana, 403);
  await pedir('PATCH', `/pedidos/${web._id}/asignar`, { id_empleado: 999999 }, admin, 404);
  const asignado = await pedir('PATCH', `/pedidos/${web._id}/asignar`, { id_empleado: 2 }, admin);
  comprobar(asignado.estado === 'ASIGNADO' && asignado.historial_estados.length === 2, 'Asignacion');
  const igual = await pedir('PATCH', `/pedidos/${web._id}/asignar`, { id_empleado: 2 }, admin);
  comprobar(igual.historial_estados.length === 2, 'Asignacion repetida no duplica historial');
  comprobar((await pedir('GET', '/pedidos/asignados', undefined, camila)).some(p => p._id === web._id), 'Asignados por repartidor');
  comprobar(!(await pedir('GET', '/pedidos/asignados', undefined, diego)).some(p => p._id === web._id), 'Otro repartidor no ve el pedido');
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'EN_CAMINO' }, diego, 404);
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'EN_CAMINO' }, ana, 403);
  await pedir('PATCH', `/pedidos/${web._id}/cancelar`, undefined, ana, 409);
  await pedir('PATCH', `/pedidos/${web._id}/cancelar`, undefined, camila, 403);
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'EFECTIVO' }, camila, 409);
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'RECIBIDO' }, camila, 400);
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'EN_CAMINO' }, camila);
  const camino = await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'EN_CAMINO' }, camila);
  comprobar(camino.historial_estados.length === 3, 'EN_CAMINO repetido es idempotente');
  await pedir('PATCH', `/pedidos/${web._id}/asignar`, { id_empleado: 3 }, admin, 409);
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'ENTREGADO' }, camila, 400);
  const entregado = await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'TRANSFERENCIA' }, camila);
  comprobar(entregado.estado_pago === 'COBRADA' && entregado.metodo_pago === 'TRANSFERENCIA' && entregado.historial_estados.length === 4, 'Entrega cobra y registra historial');
  await compararPedido(entregado);
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'TRANSFERENCIA' }, camila);
  await pedir('PATCH', `/pedidos/${web._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'EFECTIVO' }, camila, 409);
  await pedir('PATCH', `/pedidos/${web._id}/cancelar`, undefined, admin, 409);
  await pedir('DELETE', `/pedidos/${web._id}`, undefined, admin, 409);
  comprobar(await stock(p1.id_producto) === 28, 'Entregar no descuenta stock otra vez');

  const tarreoDatos = { items: [{ id_producto: p1.id_producto, cantidad: 1 }, { id_producto: p2.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' };
  const tarreo = await pedir('POST', '/ventas/calle', tarreoDatos, camila, 201, `tarreo-${marca}`);
  comprobar(tarreo.estado_pago === 'COBRADA' && tarreo.id_cliente === null && tarreo.subtotal === 35000 && tarreo.descuento === 3500 && tarreo.total === 31500, 'Tarreo cobrado con descuento agregado');
  const recibo = await mongoDb.collection('eventos_auditoria').findOne({ tipo: 'VENTA_TARREO', 'detalle.id_venta': tarreo.id_venta });
  comprobar(recibo.detalle.total === tarreo.total && recibo.detalle.descuento === tarreo.descuento && recibo.detalle.items.length === 2, 'Comprobante tarreo Mongo coincide con Oracle');
  await pedir('POST', '/ventas/calle', tarreoDatos, camila, 200, `tarreo-${marca}`);
  comprobar(await stock(p1.id_producto) === 27 && await stock(p2.id_producto) === 19, 'Tarreo repetido no duplica stock');
  await pedir('POST', '/ventas/calle', tarreoDatos, admin, 403);
  await pedir('POST', '/ventas/calle', tarreoDatos, ana, 403);
  const dia = await pedir('GET', '/ventas/dia', undefined, camila);
  comprobar(dia.ventas.some(v => v.id_venta === tarreo.id_venta) && dia.ventas.some(v => v.id_venta === web.id_venta), 'Ventas del repartidor incluyen WEB entregada y tarreo');
  comprobar(dia.ventas.every(v => v.id_empleado === 2), 'Listado diario no filtra ventas ajenas');
  await pedir('GET', '/ventas/dia?id_empleado=3', undefined, camila, 403);
  await pedir('GET', '/ventas/dia', undefined, ana, 403);
  const suma = (await sql("SELECT NVL(SUM(total_venta),0) FROM Venta WHERE id_empleado=2 AND estado_pago='COBRADA' AND fecha_venta>=TO_DATE(:fecha,'YYYY-MM-DD') AND fecha_venta<TO_DATE(:fecha,'YYYY-MM-DD')+1", { fecha: dia.fecha }))[0][0];
  comprobar(dia.resumen.total_cobrado === suma, 'Resumen diario cuadra con Oracle');

  const llamada = await telefono(2, [{ id_producto: p2.id_producto, cantidad: 1 }], `telefono-${marca}`);
  comprobar(llamada.canal === 'LLAMADA' && llamada.total === 20000 && llamada.descuento === 0 && llamada.estado_pago === 'PENDIENTE', 'Llamada sin descuento debajo del umbral');
  await pedir('PATCH', `/pedidos/${llamada._id}/estado`, { estado: 'EN_CAMINO' }, admin, 409);
  await pedir('PATCH', `/pedidos/${llamada._id}/cancelar`, undefined, ana, 404);
  const cancelada = await pedir('PATCH', `/pedidos/${llamada._id}/cancelar`, undefined, bruno);
  comprobar(cancelada.estado === 'CANCELADO' && cancelada.estado_pago === 'ANULADA' && await stock(p2.id_producto) === 19, 'Cliente cancela RECIBIDO y restaura stock');
  await compararPedido(cancelada);
  await pedir('PATCH', `/pedidos/${llamada._id}/cancelar`, undefined, bruno);
  comprobar(await stock(p2.id_producto) === 19, 'Cancelar dos veces no devuelve doble stock');
  await pedir('DELETE', `/pedidos/${llamada._id}`, undefined, bruno, 403);
  await pedir('DELETE', `/pedidos/${llamada._id}`, undefined, admin);
  await pedir('GET', `/pedidos/${llamada._id}`, undefined, admin, 404);
  comprobar(await mongoDb.collection('pedidos').countDocuments({ id_venta: llamada.id_venta }) === 0, 'Se elimina documento cancelado');
  comprobar((await sql('SELECT estado_pago FROM Venta WHERE id_venta=:id', { id: llamada.id_venta }))[0][0] === 'ANULADA', 'Venta historica se conserva');
  await pedir('POST', '/pedidos/telefonico', { id_cliente: 2, items: [{ id_producto: p2.id_producto, cantidad: 1 }], direccion_entrega: direccion, metodo_cobro: 'TRANSFERENCIA' }, admin, 409, `telefono-${marca}`);

  const enRuta = await telefono(1, [{ id_producto: p1.id_producto, cantidad: 1 }], `ruta-${marca}`);
  await pedir('PATCH', `/pedidos/${enRuta._id}/asignar`, { id_empleado: 2 }, admin);
  await pedir('PATCH', `/pedidos/${enRuta._id}/estado`, { estado: 'EN_CAMINO' }, admin);
  await pedir('PATCH', `/pedidos/${enRuta._id}/cancelar`, undefined, admin);
  comprobar(await stock(p1.id_producto) === 27, 'ADMIN cancela EN_CAMINO y devuelve stock');
  await pedir('GET', '/pedidos/invalido', undefined, admin, 400);
  await pedir('GET', '/pedidos/ffffffffffffffffffffffff', undefined, admin, 404);
  await pedir('GET', '/ventas/dia?fecha=2026-02-30', undefined, admin, 400);

  const antesVenta = (await sql('SELECT COUNT(*) FROM Venta'))[0][0];
  const antesDetalle = (await sql('SELECT COUNT(*) FROM Detalle_venta'))[0][0];
  const antesStock = await stock(p1.id_producto);
  const antesEventos = await mongoDb.collection('eventos_auditoria').countDocuments({ tipo: 'VENTA_RECHAZADA_STOCK', 'detalle.id_producto': p2.id_producto });
  const rechazo = await pedir('POST', '/pedidos/telefonico', { id_cliente: 1, direccion_entrega: direccion, metodo_cobro: 'EFECTIVO',
    items: [{ id_producto: p1.id_producto, cantidad: 1 }, { id_producto: p2.id_producto, cantidad: 9999 }] }, admin, 409, `rechazo-${marca}`);
  comprobar(rechazo.mensaje.includes('Stock insuficiente'), 'Error de stock claro');
  comprobar((await sql('SELECT COUNT(*) FROM Venta'))[0][0] === antesVenta && (await sql('SELECT COUNT(*) FROM Detalle_venta'))[0][0] === antesDetalle, 'Rollback completo de cabecera y lineas');
  comprobar(await stock(p1.id_producto) === antesStock, 'Rollback restaura primera linea si falla la segunda');
  comprobar(await mongoDb.collection('eventos_auditoria').countDocuments({ tipo: 'VENTA_RECHAZADA_STOCK', 'detalle.id_producto': p2.id_producto }) === antesEventos+1, 'Rechazo queda auditado fuera de transaccion fallida');
  comprobar((await sql('SELECT COUNT(*) FROM Solicitud_Venta WHERE id_venta IS NULL'))[0][0] === 0, 'No quedan solicitudes incompletas');

  // El carrito de Ana aun conserva precio 20000, pero checkout usa 23000 de Oracle.
  await pedir('PATCH', `/productos/${p2.id_producto}`, { precio: 23000 }, admin);
  const revalidado = await pedir('POST', '/pedidos', confirmar, ana, 201, `precio-${marca}`);
  comprobar(revalidado.items[0].precio_unitario === 23000 && revalidado.total === 23000, 'Precio revalidado en la misma transaccion');
  await pedir('PATCH', `/pedidos/${revalidado._id}/cancelar`, undefined, ana);
  await pedir('PATCH', `/productos/${p2.id_producto}`, { precio: 20000 }, admin);
  await pedir('POST', '/carrito/items', { id_producto: p2.id_producto, cantidad: 1 }, bruno);
  await mongoDb.collection('carritos').updateOne({ id_cliente: 2 }, { $set: { expira_en: new Date(Date.now()-60000) } });
  comprobar((await pedir('GET', '/carrito', undefined, bruno)).items.length === 0, 'Carrito vencido se rechaza aunque TTL no lo haya borrado');
  await pedir('POST', '/pedidos', confirmar, bruno, 409, `vencido-${marca}`);
  const indiceTtl = (await mongoDb.collection('carritos').indexes()).find(i => i.name === 'ttl_carrito');
  comprobar(indiceTtl.expireAfterSeconds === 0, 'TTL permanece habilitado');

  const duplicadas = await Promise.all([peticion('POST', '/ventas/calle', { items: [{ id_producto: p1.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, camila, `concurrente-${marca}`),
    peticion('POST', '/ventas/calle', { items: [{ id_producto: p1.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, camila, `concurrente-${marca}`)]);
  assert.deepEqual(duplicadas.map(r => r.estado).sort(), [200,201]); comprobaciones += 1;
  comprobar(duplicadas[0].cuerpo.id_venta === duplicadas[1].cuerpo.id_venta && await stock(p1.id_producto) === 26, 'Confirmacion concurrente con misma clave crea una venta');
  const ultimo = await producto('Ultimo', 5000, 1);
  const competencia = await Promise.all([peticion('POST', '/ventas/calle', { items: [{ id_producto: ultimo.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, camila, `ultimo-a-${marca}`),
    peticion('POST', '/ventas/calle', { items: [{ id_producto: ultimo.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, diego, `ultimo-b-${marca}`)]);
  assert.deepEqual(competencia.map(r => r.estado).sort(), [201,409]); comprobaciones += 1;
  comprobar(await stock(ultimo.id_producto) === 0, 'Dos compradores no venden dos veces el ultimo balon');

  const reasignado = await telefono(1, [{ id_producto: p1.id_producto, cantidad: 1 }], `reasignado-${marca}`);
  await pedir('PATCH', `/pedidos/${reasignado._id}/asignar`, { id_empleado: 2 }, admin);
  await pedir('PATCH', `/pedidos/${reasignado._id}/asignar`, { id_empleado: 3 }, admin);
  await mongoDb.collection('pedidos').updateOne({ _id: new ObjectId(reasignado._id) }, { $set: { repartidor: { id_empleado: 2, nombre: 'Camila Soto' }, 'items.0.cantidad': 999, 'items.0.precio_unitario': 1 } });
  comprobar(!(await pedir('GET', '/pedidos/asignados', undefined, camila)).some(p => p._id === reasignado._id), 'Una copia Mongo atrasada no revela pedidos reasignados al repartidor anterior');
  await pedir('GET', `/pedidos/${reasignado._id}`, undefined, camila, 404);
  const detalleActual = await pedir('GET', `/pedidos/${reasignado._id}`, undefined, diego);
  comprobar(detalleActual.items[0].cantidad === 1 && detalleActual.items[0].precio_unitario === 15000, 'Cantidades y precios se verifican en Oracle aunque Mongo tenga una copia alterada');
  await pedir('PATCH', `/pedidos/${reasignado._id}/cancelar`, undefined, admin);

  const carrera = await telefono(1, [{ id_producto: p1.id_producto, cantidad: 1 }], `carrera-${marca}`);
  await pedir('PATCH', `/pedidos/${carrera._id}/asignar`, { id_empleado: 2 }, admin);
  await pedir('PATCH', `/pedidos/${carrera._id}/estado`, { estado: 'EN_CAMINO' }, camila);
  const decisiones = await Promise.all([peticion('PATCH', `/pedidos/${carrera._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'EFECTIVO' }, camila),
    peticion('PATCH', `/pedidos/${carrera._id}/cancelar`, undefined, admin)]);
  assert.deepEqual(decisiones.map(r => r.estado).sort(), [200,409]); comprobaciones += 1;
  const final = await pedir('GET', `/pedidos/${carrera._id}`, undefined, admin);
  comprobar((final.estado === 'ENTREGADO' && final.estado_pago === 'COBRADA' && await stock(p1.id_producto) === 25) ||
    (final.estado === 'CANCELADO' && final.estado_pago === 'ANULADA' && await stock(p1.id_producto) === 26), 'Entrega y cancelacion concurrentes no cobran y devuelven a la vez');
  await compararPedido(final);
  const auditoriasStock = await mongoDb.collection('eventos_auditoria').find({ tipo: 'CAMBIO_STOCK', 'detalle.id_venta': web.id_venta }).toArray();
  comprobar(auditoriasStock.length === 1 && auditoriasStock[0].detalle.antes === 30 && auditoriasStock[0].detalle.despues === 28, 'Auditoria stock de WEB coincide con Oracle');
  const anuladas = await pedir('GET', '/ventas/dia?estado_pago=ANULADA', undefined, admin);
  comprobar(anuladas.ventas.every(v => v.estado_pago === 'ANULADA') && anuladas.resumen.total_cobrado === 0 && anuladas.resumen.cobradas === 0, 'Anuladas no se suman como dinero cobrado');

  // Simula una limpieza encolada que llega despues de una edicion del carrito.
  const previo = await pedir('POST', '/carrito/items', { id_producto: p1.id_producto, cantidad: 1 }, ana);
  const limpieza = await oraclePool.getConnection();
  try {
    await encolar(limpieza, 'CARRITO_LIMPIAR', { id_cliente: 1, version: previo.version, actualizado_en: previo.actualizado_en });
    const posterior = await pedir('PATCH', `/carrito/items/${p1.id_producto}`, { cantidad: 2 }, ana);
    await limpieza.commit();
    await pedir('POST', '/sincronizacion/reintentar', undefined, admin);
    const conservado = await pedir('GET', '/carrito', undefined, ana);
    comprobar(conservado.version === posterior.version && conservado.items[0].cantidad === 2, 'Limpieza pendiente no borra una version posterior');
  } finally { await limpieza.rollback(); await limpieza.close(); }
  await pedir('DELETE', '/carrito', undefined, ana);
  // Simula que Mongo todavia conserva la version consumida, con una clave distinta.
  const saldoAntes = await stock(p1.id_producto);
  await pedir('POST', '/carrito/items', { id_producto: p1.id_producto, cantidad: 1 }, ana);
  const snapshotViejo = await mongoDb.collection('carritos').findOne({ id_cliente: 1 });
  const guardado = await pedir('POST', '/pedidos', confirmar, ana, 201, `version-a-${marca}`);
  await mongoDb.collection('carritos').insertOne(snapshotViejo);
  comprobar((await pedir('GET', '/carrito', undefined, ana)).items.length === 0, 'Una copia ya consumida es logicamente vacia aunque siga en Mongo');
  const otraClave = await pedir('POST', '/pedidos', confirmar, ana, 409, `version-b-${marca}`);
  comprobar(otraClave.mensaje.includes('version') && await stock(p1.id_producto) === saldoAntes-1, 'Una version de carrito no crea dos ventas aunque cambie Idempotency-Key');
  const carritoPosterior = await pedir('POST', '/carrito/items', { id_producto: p2.id_producto, cantidad: 1 }, ana);
  comprobar(carritoPosterior.items.length === 1 && carritoPosterior.items[0].id_producto === p2.id_producto && carritoPosterior.items[0].cantidad === 1, 'Agregar tras confirmar no arrastra lineas de la version consumida');
  await pedir('DELETE', '/carrito', undefined, ana);
  await pedir('PATCH', `/pedidos/${guardado._id}/cancelar`, undefined, ana);
  comprobar(await stock(p1.id_producto) === saldoAntes, 'Cancelacion del pedido de prueba de version restaura stock');
  console.log(`FASE 3 VENTAS OK: ${comprobaciones} comprobaciones.`);
} finally {
  await Promise.allSettled([mongoClient.close(), oraclePool.close(0)]);
}
