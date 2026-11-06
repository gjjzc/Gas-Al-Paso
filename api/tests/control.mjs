// Solo desarrollo: crea repartidores, ventas, cargas y cierres ficticios.
import assert from 'node:assert/strict';
import { oraclePool, mongoClient, mongoDb } from './src/config/databases.js';
const base = 'http://127.0.0.1:4000/api';
const marca = Date.now();
let verificaciones = 0;
let admin, cliente;
async function solicitud(metodo, ruta, datos, token, clave) {
  const r = await fetch(base+ruta, { method: metodo, headers: {
    ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(clave ? { 'Idempotency-Key': clave } : {}),
  }, body: datos === undefined ? undefined : JSON.stringify(datos), signal: AbortSignal.timeout(30000) });
  return { estado: r.status, cuerpo: await r.json() };
}
async function pedir(m, ruta, datos, token, esperado = 200, clave) {
  const r = await solicitud(m, ruta, datos, token, clave);
  assert.equal(r.estado, esperado, `${m} ${ruta}: ${JSON.stringify(r.cuerpo)}`);
  verificaciones += 1;
  return r.cuerpo;
}
function comprobar(condicion, mensaje) { assert.ok(condicion, mensaje); verificaciones += 1; }
async function sql(sentencia, binds = {}) {
  const c = await oraclePool.getConnection();
  try { return (await c.execute(sentencia, binds)).rows; } finally { await c.close(); }
}
async function login(email) { return (await pedir('POST', '/auth/login', { email, password: 'GasPasoDemo2026!' })).token; }
async function repartidor(nombre) {
  const u = await pedir('POST', '/usuarios', { nombre: `Control ${nombre}`, email: `control-${nombre}-${marca}@demo.test`,
    password: 'GasPasoDemo2026!', rol: 'REPARTIDOR', comunas: [1] }, admin, 201);
  return { ...u, token: await login(u.email) };
}
async function cargar(rep, items, clave, fecha) {
  return pedir('POST', '/cargas', { id_empleado: rep.id_empleado, items, ...(fecha ? { fecha } : {}) }, admin, 201, clave);
}
async function vender(rep, producto, cantidad, metodo = 'EFECTIVO', clave) {
  return pedir('POST', '/ventas/calle', { items: [{ id_producto: producto, cantidad }], metodo_pago: metodo }, rep.token, 201, clave);
}
async function cuadratura(rep, fecha) {
  return (await pedir('GET', `/cuadratura?id_empleado=${rep.id_empleado}${fecha ? '&fecha='+fecha : ''}`, undefined, admin)).repartidores[0];
}
async function telefono(producto, clave) {
  return pedir('POST', '/pedidos/telefonico', { id_cliente: 1, direccion_entrega: { calle: 'Control', numero: '1', id_comuna: 1 },
    metodo_cobro: 'EFECTIVO', items: [{ id_producto: producto, cantidad: 1 }] }, admin, 201, clave);
}
try {
  admin = await login('admin@demo.gasalpaso.test');
  cliente = await login('ana@demo.gasalpaso.test');
  const a = await repartidor('equilibrado');
  const b = await repartidor('dinero');
  const c = await repartidor('balones');
  const d = await repartidor('metodos');
  const e = await repartidor('pendientes');
  const f = await repartidor('sin-movimientos');
  const p = await pedir('POST', '/catalogo', { nombre: `Control A ${marca}`, descripcion: 'Balon control demo', categoria: 'GAS', peso: 5, precio: 15000, stock: 200 }, admin, 201);
  const q = await pedir('POST', '/catalogo', { nombre: `Control B ${marca}`, descripcion: 'Balon control demo', categoria: 'GAS', peso: 11, precio: 20000, stock: 200 }, admin, 201);
  const accesorio = await pedir('POST', '/catalogo', { nombre: `Control accesorio ${marca}`, descripcion: 'Accesorio demo', categoria: 'ACCESORIO', peso: 0.3, precio: 2000, stock: 20 }, admin, 201);
  await pedir('GET', '/cargas', undefined, cliente, 403);
  await pedir('GET', '/cargas', undefined, a.token, 403);
  await pedir('GET', '/cuadratura', undefined, a.token, 403);
  await pedir('POST', '/cierre', {}, admin, 403);
  await pedir('POST', '/cierre', {}, cliente, 403);
  await pedir('GET', '/auditoria', undefined, a.token, 403);

  const carga = await cargar(a, [{ id_producto: p.id_producto, cantidad_cargada: 3 }, { id_producto: q.id_producto, cantidad_cargada: 2 }], `carga-a-${marca}`);
  const copia = await pedir('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 3 }, { id_producto: q.id_producto, cantidad_cargada: 2 }] }, admin, 200, `carga-a-${marca}`);
  comprobar(copia.reutilizada && copia.items[0].cantidad_cargada === 3, 'Reintento de carga no duplica cantidades');
  await cargar(a, [{ id_producto: p.id_producto, cantidad_cargada: 2 }], `recarga-a-${marca}`);
  await pedir('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }] }, admin, 409, `carga-a-${marca}`);
  await pedir('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: -1 }] }, admin, 400);
  await pedir('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: accesorio.id_producto, cantidad_cargada: 1 }] }, admin, 400);
  await pedir('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }, { id_producto: 999999999, cantidad_cargada: 1 }] }, admin, 400);
  const cantidades = (await pedir('GET', `/cargas?id_empleado=${a.id_empleado}`, undefined, admin)).cargas;
  comprobar(cantidades.find(i => i.id_producto === p.id_producto).cantidad_cargada === 5, 'Recarga suma y error de segunda linea hace rollback');
  comprobar((await sql('SELECT stock FROM Productos WHERE id_producto=:id', { id: p.id_producto }))[0][0] === 200, 'Cargas no modifican stock global');
  const repetidas = await Promise.all([solicitud('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }] }, admin, `carga-paralela-${marca}`),
    solicitud('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }] }, admin, `carga-paralela-${marca}`)]);
  assert.deepEqual(repetidas.map(r => r.estado).sort(), [200,201]); verificaciones += 1;
  const cash = await vender(a, p.id_producto, 2, 'EFECTIVO', `venta-a-${marca}`);
  await vender(a, q.id_producto, 1, 'TRANSFERENCIA', `venta-a-t-${marca}`);
  comprobar(cash.total === 27000 && cash.descuento === 3000, 'Dinero esperado incluye descuento real');
  const abierto = await cuadratura(a);
  comprobar(abierto.estado === 'ABIERTO' && abierto.dinero.total.entregado === null && abierto.descuadre === null, 'Abierto no se marca como dinero faltante antes de declarar');
  comprobar(abierto.dinero.efectivo.esperado === 27000 && abierto.dinero.transferencia.esperado === 20000 && abierto.ventas.cantidad === 2, 'Esperados separados por metodo');
  const datosA = { entregado_efectivo: 27000, entregado_transferencia: 20000,
    devueltos: [{ id_producto: p.id_producto, devuelto: 4 }, { id_producto: q.id_producto, devuelto: 1 }], observacion: 'Todo cuadra' };
  await pedir('POST', '/cierre', { ...datosA, devueltos: [datosA.devueltos[0]] }, a.token, 400);
  await pedir('POST', '/cierre', { ...datosA, total_esperado: 0 }, a.token, 400);
  await pedir('POST', '/cierre', { ...datosA, id_empleado: b.id_empleado }, a.token, 400);
  await pedir('POST', '/cierre', { ...datosA, fecha: '9999-12-30' }, a.token, 400);
  await pedir('POST', '/cierre', { ...datosA, entregado_efectivo: -1 }, a.token, 400);
  const saldoAntes = (await sql('SELECT stock FROM Productos WHERE id_producto=:id', { id: p.id_producto }))[0][0];
  const cierreA = await pedir('POST', '/cierre', datosA, a.token, 201, `cierre-a-${marca}`);
  comprobar(cierreA.estado === 'CUADRADO' && cierreA.descuadre === false && cierreA.dinero.total.diferencia === 0 && cierreA.balones.every(i => i.diferencia === 0), 'Cierre equilibrado dinero y balones');
  comprobar((await sql('SELECT stock FROM Productos WHERE id_producto=:id', { id: p.id_producto }))[0][0] === saldoAntes, 'Devoluciones de control no modifican stock global');
  const sqlCierre = (await sql('SELECT total_esperado,monto_entregado,diferencia FROM Cierre_caja WHERE id_cierre=:id', { id: cierreA.cierre.id_cierre }))[0];
  assert.deepEqual(sqlCierre, [47000,47000,0]); verificaciones += 1;
  comprobar((await sql('SELECT COUNT(*) FROM Cierre_stock WHERE id_cierre=:id', { id: cierreA.cierre.id_cierre }))[0][0] === 2, 'Cabecera y dos detalles del cierre guardados');
  const mismo = await pedir('POST', '/cierre', datosA, a.token, 200, `cierre-a-${marca}`);
  comprobar(mismo.cierre.id_cierre === cierreA.cierre.id_cierre && mismo.reutilizada, 'Reintento cierre devuelve el mismo registro');
  await pedir('POST', '/cierre', datosA, a.token, 409, `cierre-otro-${marca}`);
  await pedir('POST', '/cargas', { id_empleado: a.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }] }, admin, 409);
  await pedir('POST', '/ventas/calle', { items: [{ id_producto: p.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, a.token, 409, `tarde-${marca}`);
  await pedir('POST', '/ventas/calle', { items: [{ id_producto: p.id_producto, cantidad: 2 }], metodo_pago: 'EFECTIVO' }, a.token, 200, `venta-a-${marca}`);
  const sinAsignar = await telefono(p.id_producto, `asignar-cerrado-${marca}`);
  await pedir('PATCH', `/pedidos/${sinAsignar._id}/asignar`, { id_empleado: a.id_empleado }, admin, 409);
  await pedir('PATCH', `/pedidos/${sinAsignar._id}/cancelar`, undefined, admin);

  await cargar(b, [{ id_producto: p.id_producto, cantidad_cargada: 2 }]);
  await vender(b, p.id_producto, 1);
  const faltaDinero = await pedir('POST', '/cierre', { entregado_efectivo: 14000, entregado_transferencia: 0, devueltos: [{ id_producto: p.id_producto, devuelto: 1 }] }, b.token, 201);
  comprobar(faltaDinero.estado === 'DESCUADRE' && faltaDinero.dinero.total.diferencia === -1000 && faltaDinero.balones[0].diferencia === 0, 'Falta dinero aunque balones cuadren');
  comprobar((await cuadratura(b)).dinero.efectivo.diferencia === -1000, 'Reporte conserva alerta por dinero faltante');
  await cargar(c, [{ id_producto: p.id_producto, cantidad_cargada: 3 }]);
  await vender(c, p.id_producto, 1, 'TRANSFERENCIA');
  const faltaBalon = await pedir('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 15000, devueltos: [{ id_producto: p.id_producto, devuelto: 1 }] }, c.token, 201);
  comprobar(faltaBalon.estado === 'DESCUADRE' && faltaBalon.dinero.descuadre === false && faltaBalon.balones[0].diferencia === -1, 'Falta un balon aunque dinero cuadre');
  await cargar(d, [{ id_producto: p.id_producto, cantidad_cargada: 3 }]);
  await vender(d, p.id_producto, 1, 'EFECTIVO');
  await vender(d, p.id_producto, 1, 'TRANSFERENCIA');
  const cruzado = await pedir('POST', '/cierre', { entregado_efectivo: 14000, entregado_transferencia: 16000, devueltos: [{ id_producto: p.id_producto, devuelto: 1 }] }, d.token, 201);
  comprobar(cruzado.dinero.total.diferencia === 0 && cruzado.estado === 'DESCUADRE' && cruzado.dinero.efectivo.diferencia === -1000 && cruzado.dinero.transferencia.diferencia === 1000, 'Diferencias por metodo no se ocultan por neto cero');

  const pendiente = await telefono(p.id_producto, `pendiente-${marca}`);
  await pedir('PATCH', `/pedidos/${pendiente._id}/asignar`, { id_empleado: e.id_empleado }, admin);
  await pedir('PATCH', `/pedidos/${pendiente._id}/estado`, { estado: 'EN_CAMINO' }, e.token);
  const rechazado = await pedir('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 0, devueltos: [] }, e.token, 409);
  comprobar(rechazado.mensaje.includes('sin resolver'), 'Cierre bloquea pedidos propios sin resolver');
  comprobar((await sql('SELECT COUNT(*) FROM Cierre_caja WHERE id_empleado=:id', { id: e.id_empleado }))[0][0] === 0, 'Cierre rechazado no deja cabecera parcial');
  const vacio = await pedir('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 0, devueltos: [] }, f.token, 201);
  comprobar(vacio.estado === 'CUADRADO', 'Pendientes de otro repartidor no bloquean mi cierre');
  await pedir('PATCH', `/pedidos/${pendiente._id}/cancelar`, undefined, admin);
  await pedir('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 0, devueltos: [] }, e.token, 201);

  const g = await repartidor('fecha-cobro');
  const entrega = await telefono(p.id_producto, `fecha-${marca}`);
  comprobar((await sql('SELECT fecha_cobro FROM Venta WHERE id_venta=:id', { id: entrega.id_venta }))[0][0] === null, 'Pendiente no tiene fecha de cobro');
  await new Promise(r => setTimeout(r,1100));
  await pedir('PATCH', `/pedidos/${entrega._id}/asignar`, { id_empleado: g.id_empleado }, admin);
  await pedir('PATCH', `/pedidos/${entrega._id}/estado`, { estado: 'EN_CAMINO' }, g.token);
  await pedir('PATCH', `/pedidos/${entrega._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'TRANSFERENCIA' }, g.token);
  const fechas = (await sql('SELECT fecha_venta,fecha_cobro FROM Venta WHERE id_venta=:id', { id: entrega.id_venta }))[0];
  comprobar(fechas[1] instanceof Date && fechas[1] > fechas[0], 'Fecha de cobro se captura al entregar, no al crear');
  await pedir('PATCH', `/pedidos/${entrega._id}/estado`, { estado: 'ENTREGADO', metodo_pago: 'TRANSFERENCIA' }, g.token);
  comprobar((await sql('SELECT fecha_cobro FROM Venta WHERE id_venta=:id', { id: entrega.id_venta }))[0][0].getTime() === fechas[1].getTime(), 'Reintento de entrega no cambia fecha de cobro');
  const reporteG = await cuadratura(g);
  comprobar(reporteG.dinero.transferencia.esperado === 15000 && reporteG.balones[0].cargado === 0 && reporteG.balones[0].vendido === 1, 'Ventas sin carga tambien aparecen en cuadratura');
  await cargar(g, [{ id_producto: p.id_producto, cantidad_cargada: 1 }]);
  await pedir('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 15000, devueltos: [{ id_producto: p.id_producto, devuelto: 0 }] }, g.token, 201);

  const h = await repartidor('carrera-venta');
  await cargar(h, [{ id_producto: p.id_producto, cantidad_cargada: 2 }]);
  const carrera = await Promise.all([solicitud('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 0, devueltos: [{ id_producto: p.id_producto, devuelto: 2 }] }, h.token, `carrera-cierre-${marca}`),
    solicitud('POST', '/ventas/calle', { items: [{ id_producto: p.id_producto, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, h.token, `carrera-venta-${marca}`)]);
  comprobar(carrera[0].estado === 201 && [201,409].includes(carrera[1].estado), 'Cierre y venta concurrentes se serializan');
  const rh = await cuadratura(h);
  comprobar(rh.cierre.desactualizado === false && rh.cierre.total_esperado === rh.dinero.total.esperado, 'No entra dinero nuevo sin incluirlo en cierre');
  const i = await repartidor('carrera-carga');
  await cargar(i, [{ id_producto: p.id_producto, cantidad_cargada: 2 }]);
  const carreraCarga = await Promise.all([solicitud('POST', '/cierre', { entregado_efectivo: 0, entregado_transferencia: 0, devueltos: [{ id_producto: p.id_producto, devuelto: 2 }] }, i.token),
    solicitud('POST', '/cargas', { id_empleado: i.id_empleado, items: [{ id_producto: p.id_producto, cantidad_cargada: 1 }] }, admin)]);
  comprobar(carreraCarga[0].estado === 201 && [201,409].includes(carreraCarga[1].estado), 'Cierre y recarga concurrentes se serializan');
  comprobar((await cuadratura(i)).cierre.desactualizado === false, 'Carga aceptada queda incluida en snapshot del cierre');
  const idCierreA = cierreA.cierre.id_cierre;
  const eventos = await pedir('GET', `/auditoria?tipo=CIERRE_CAJA&id_empleado=${a.id_empleado}`, undefined, admin);
  comprobar(eventos.some(ev => ev.detalle.id_cierre === idCierreA && ev.detalle.estado === 'CUADRADO'), 'Auditoria de cierre visible con filtro por repartidor');
  const cargasAuditadas = await pedir('GET', `/auditoria?tipo=CARGA_DIARIA&id_empleado=${a.id_empleado}`, undefined, admin);
  comprobar(cargasAuditadas.length === 3, 'Cada recarga efectiva auditada una vez');
  const informe = await pedir('GET', `/cuadratura?fecha=${carga.fecha}`, undefined, admin);
  comprobar(informe.resumen.con_descuadre >= 3 && informe.repartidores.find(r => r.id_empleado === a.id_empleado).estado === 'CUADRADO', 'Reporte general distingue cuadros y descuadres');
  await pedir('GET', '/cuadratura?fecha=2026-02-30', undefined, admin, 400);
  await pedir('GET', '/auditoria?fecha=invalida', undefined, admin, 400);
  await pedir('PATCH', `/usuarios/${a.id_usuario}`, { rol: 'ADMIN' }, admin);
  await pedir('PATCH', `/usuarios/${a.id_usuario}`, { activo: false }, admin);
  const historico = await cuadratura(a);
  comprobar(historico.estado === 'CUADRADO' && historico.activo === false, 'El cierre historico sigue visible tras cambiar rol y desactivar al trabajador');
  console.log(`FASE 4 CONTROL OK: ${verificaciones} comprobaciones.`);
} finally { await Promise.allSettled([mongoClient.close(),oraclePool.close(0)]); }
