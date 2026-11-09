import { iniciar, req, cliente, repartidor, producto, web, entregar, cerrar, ok, igual, mongoDb, marca, direccion } from './tests/soporte/verificaciones.mjs';
try {
  const admin = await iniciar(), r = await repartidor(admin), c = await cliente(), p = await producto(admin);
  const carga = { id_empleado: r.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 10 }] };
  await req('POST', '/cargas', carga, admin, 201, 'carga-'+marca);
  const repetida = await req('POST', '/cargas', carga, admin, 200, 'carga-'+marca); ok(repetida.reutilizada);
  await req('POST', '/cargas', { ...carga, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }] }, admin, 409, 'carga-'+marca);
  const pedido = await web(c, p, 2);
  await req('PATCH', `/pedidos/${pedido._id}/asignar`, { id_empleado: r.id_empleado }, admin);
  await req('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 0, devueltos: [{ id_producto: p.id_producto, devuelto: 10 }] }, r.token, 409);
  await req('PATCH', `/pedidos/${pedido._id}/estado`, { estado: 'EN_CAMINO' }, r.token);
  await req('PATCH', `/pedidos/${pedido._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'TRANSFERENCIA' }, r.token);
  const calle = { items: [{ id_producto: p.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' };
  const v = await req('POST', '/ventas/calle', calle, r.token, 201, 'calle-'+marca);
  igual(v.total, 15000); igual(v.estado_pago, 'COBRADA'); igual(v.id_pedido_mongo, null);
  const antes = await req('GET', '/cierre', undefined, r.token);
  igual(antes.dinero.efectivo.esperado, 15000); igual(antes.dinero.transferencia.esperado, 27000);
  igual(antes.balones.find(b => b.id_producto === p.id_producto).vendido, 3);
  await req('POST', '/cierre', { entregado_efectivo: 15000, entregado_transferencia: 27000, devueltos: [] }, r.token, 400);
  const datos = { entregado_efectivo: 15000, entregado_transferencia: 27000, devueltos: [{ id_producto: p.id_producto, devuelto: 7 }] };
  const cierre = await req('POST', '/cierre', datos, r.token, 201, 'cierre-'+marca);
  igual(cierre.estado, 'CUADRADO'); igual(cierre.balones[0].diferencia, 0);
  const retry = await req('POST', '/cierre', datos, r.token, 200, 'cierre-'+marca);
  igual(retry.cierre.id_cierre, cierre.cierre.id_cierre);
  await req('POST', '/ventas/calle', calle, r.token, 409);
  await req('POST', '/cargas', carga, admin, 409);
  const nuevo = await web(c, p, 1);
  await req('PATCH', `/pedidos/${nuevo._id}/asignar`, { id_empleado: r.id_empleado }, admin, 409);
  const q = await req('GET', `/cuadratura?id_empleado=${r.id_empleado}`, undefined, admin);
  igual(q.repartidores[0].estado, 'CUADRADO'); igual(q.repartidores[0].cierre.desactualizado, false);
  const r2 = await repartidor(admin);
  const venta2 = await req('POST', '/ventas/calle', calle, r2.token, 201);
  const des = await req('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: venta2.total, devueltos: [{ id_producto: p.id_producto, devuelto: 0 }] }, r2.token, 201);
  igual(des.estado, 'DESCUADRE'); igual(des.dinero.total.diferencia, 0); ok(des.dinero.efectivo.descuadre && des.dinero.transferencia.descuadre, 'Descuadres por método aunque el total cuadre');
  const r3 = await repartidor(admin);
  const carrera = await Promise.all([
    req('POST', '/ventas/calle', calle, r3.token, [201, 409]),
    req('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 0, devueltos: [{ id_producto: p.id_producto, devuelto: 0 }] }, r3.token, 201),
  ]);
  const final = await req('GET', '/cierre', undefined, r3.token);
  igual(final.cierre.desactualizado, false, 'Cierre y venta concurrentes se serializan');
  igual(final.dinero.total.esperado, carrera[0].id_venta ? 15000 : 0);
  const r4 = await repartidor(admin);
  await req('POST', '/cargas', { id_empleado: r4.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }] }, admin, 201);
  const enRuta = await web(c, p, 1);
  await req('PATCH', `/pedidos/${enRuta._id}/asignar`, { id_empleado: r4.id_empleado }, admin);
  await req('PATCH', `/pedidos/${enRuta._id}/estado`, { estado: 'EN_CAMINO' }, r4.token);
  const datos4 = { entregado_efectivo: 15000, entregado_transferencia: 0, devueltos: [{ id_producto: p.id_producto, devuelto: 0 }] };
  const [entrega4, cierre4] = await Promise.all([
    req('PATCH', `/pedidos/${enRuta._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'EFECTIVO' }, r4.token),
    req('POST', '/cierre', datos4, r4.token, [201, 409]),
  ]);
  if (!cierre4.cierre) await req('POST', '/cierre', datos4, r4.token, 201);
  const reporte4 = await req('GET', '/cierre', undefined, r4.token);
  igual(reporte4.dinero.total.esperado, 15000);
  igual(reporte4.cierre.desactualizado, false, 'Entrega y cierre concurrentes incluyen el cobro exactamente una vez');
  const audit = await req('GET', `/auditoria?tipo=CIERRE_CAJA&id_empleado=${r.id_empleado}`, undefined, admin);
  igual(audit.length, 1);
  await req('PATCH', `/usuarios/${r.id_usuario}`, { rol: 'ADMIN', activo: false }, admin);
  const historico = await req('GET', `/cuadratura?id_empleado=${r.id_empleado}`, undefined, admin);
  igual(historico.repartidores[0].activo, false); igual(historico.repartidores[0].estado, 'CUADRADO');
} finally { await cerrar('M3 CONTROL'); }
