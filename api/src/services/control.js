import { mongoDb } from '../config/databases.js';
import { transaccion } from './transacciones.js';
import { idempotente } from './idempotencia.js';
import { siguienteId } from './contadores.js';
import { auditar } from './auditoria.js';
import { asegurarDiaAbierto, fechaActual, rangoDia } from './jornada.js';
import { repartidorActivo } from './empleados.js';
import { centavos, pesos, sumar, diferencia, calcular } from './importes.js';
import { exigir } from '../middlewares/validar.js';
const esBalon = p => [5, 11, 15, 45].includes(p.atributos?.peso_kg);

async function pendientes(session, empleado) {
  return mongoDb.collection('pedidos').find({ id_empleado: empleado, canal: { $in: ['WEB', 'LLAMADA'] }, estado_pago: 'PENDIENTE' }, { session }).sort({ id_venta: 1 }).toArray();
}
function metodo(esperado, entregado) {
  const dif = entregado === null ? null : diferencia(entregado, esperado);
  return { esperado, entregado, diferencia: dif, descuadre: dif === null ? null : dif !== 0 };
}
async function datosDia(session, empleado, fecha, cierre) {
  const ventas = await mongoDb.collection('pedidos').find({ id_empleado: empleado, estado_pago: 'COBRADA', fecha_cobro: rangoDia(fecha) }, { session }).toArray();
  const carga = await mongoDb.collection('cargas_diarias').findOne({ id_empleado: empleado, fecha }, { session });
  const catalogo = await mongoDb.collection('catalogo').find({}, { session }).toArray();
  const porId = new Map(catalogo.map(p => [p.id_producto, p]));
  const productos = new Map();
  for (const v of ventas) for (const i of (v.items.every(i => i.subtotal !== undefined) ? v.items : calcular(v.items).lineas)) {
    if (!productos.has(i.id_producto)) productos.set(i.id_producto, { id_producto: i.id_producto, nombre: i.nombre, cantidad: 0, subtotal: 0n, descuento: 0n, total: 0n });
    const p = productos.get(i.id_producto);
    p.cantidad += i.cantidad;
    for (const campo of ['subtotal', 'descuento', 'total']) p[campo] += centavos(i[campo]);
  }
  const fisico = new Map();
  for (const i of [...(carga?.items || []), ...(cierre?.balones || [])]) {
    const p = porId.get(i.id_producto);
    fisico.set(i.id_producto, { id_producto: i.id_producto, nombre: p?.nombre || '', peso: p?.atributos.peso_kg,
      cargado: carga?.items.find(f => f.id_producto === i.id_producto)?.cantidad_cargada || 0, vendido: 0 });
  }
  for (const p of productos.values()) if (esBalon(porId.get(p.id_producto) || {}) || fisico.has(p.id_producto)) {
    if (!fisico.has(p.id_producto)) fisico.set(p.id_producto, { id_producto: p.id_producto, nombre: p.nombre,
      peso: porId.get(p.id_producto)?.atributos.peso_kg, cargado: 0, vendido: 0 });
    fisico.get(p.id_producto).vendido = p.cantidad;
  }
  return { ventas, balones: [...fisico.values()].sort((a, b) => a.id_producto - b.id_producto),
    productos: [...productos.values()].sort((a, b) => a.id_producto - b.id_producto).map(p => ({ ...p, subtotal: pesos(p.subtotal), descuento: pesos(p.descuento), total: pesos(p.total) })) };
}
async function reporte(session, empleado, fecha) {
  const persona = await mongoDb.collection('empleados').findOne({ id_empleado: empleado }, { session });
  exigir(persona, 'Empleado no encontrado.', 404);
  const cierre = await mongoDb.collection('cierres_caja').findOne({ id_empleado: empleado, fecha }, { session });
  const datos = await datosDia(session, empleado, fecha, cierre);
  const ventas = { cantidad: datos.ventas.length, subtotal: sumar(datos.ventas, 'subtotal'), descuento: sumar(datos.ventas, 'descuento'),
    total: sumar(datos.ventas, 'total'), efectivo: sumar(datos.ventas.filter(v => v.metodo_pago === 'EFECTIVO'), 'total'),
    transferencia: sumar(datos.ventas.filter(v => v.metodo_pago === 'TRANSFERENCIA'), 'total') };
  const efectivo = metodo(ventas.efectivo, cierre?.dinero.efectivo.entregado ?? null);
  const transferencia = metodo(ventas.transferencia, cierre?.dinero.transferencia.entregado ?? null);
  const total = metodo(ventas.total, cierre?.dinero.total.entregado ?? null);
  const balones = datos.balones.map(b => {
    const declarado = cierre?.balones.find(i => i.id_producto === b.id_producto);
    const devuelto = cierre ? declarado?.devuelto || 0 : null;
    const dif = cierre ? b.vendido + devuelto - b.cargado : null;
    return { ...b, devuelto, diferencia: dif, descuadre: dif === null ? null : dif !== 0, declarado: Boolean(declarado) };
  });
  const cambiado = cierre && (centavos(cierre.dinero.total.esperado) !== centavos(ventas.total) ||
    centavos(cierre.dinero.efectivo.esperado) !== centavos(ventas.efectivo) ||
    centavos(cierre.dinero.transferencia.esperado) !== centavos(ventas.transferencia) ||
    balones.some(b => !cierre.balones.some(d => d.id_producto === b.id_producto && d.cargado === b.cargado && d.vendido === b.vendido)));
  const descuadreDinero = cierre ? efectivo.descuadre || transferencia.descuadre || total.descuadre : null;
  const descuadre = cierre ? Boolean(descuadreDinero || balones.some(b => b.descuadre) || cambiado) : null;
  const resumenCierre = cierre ? { id_cierre: cierre.id_cierre, total_esperado: cierre.dinero.total.esperado,
    monto_entregado: cierre.dinero.total.entregado, diferencia: cierre.dinero.total.diferencia, observacion: cierre.observacion || null,
    esperado_efectivo: cierre.dinero.efectivo.esperado, esperado_transferencia: cierre.dinero.transferencia.esperado,
    entregado_efectivo: cierre.dinero.efectivo.entregado, entregado_transferencia: cierre.dinero.transferencia.entregado,
    desactualizado: Boolean(cambiado) } : null;
  return { fecha, id_empleado: empleado, nombre: persona.nombre, activo: persona.activo,
    estado: cierre ? (descuadre ? 'DESCUADRE' : 'CUADRADO') : 'ABIERTO', descuadre,
    dinero: { efectivo, transferencia, total, descuadre: descuadreDinero }, balones, ventas, productos_vendidos: datos.productos,
    pedidos_sin_resolver: (await pendientes(session, empleado)).map(p => ({ id_venta: p.id_venta, id_pedido_mongo: p._id.toHexString() })), cierre: resumenCierre };
}
export async function cargar(usuario, datos, clave) {
  return idempotente(`control:${usuario.id_usuario}`, clave, { tipo: 'CARGA', ...datos }, async session => {
    const fecha = await asegurarDiaAbierto(session, datos.id_empleado, datos.fecha || fechaActual());
    await repartidorActivo(session, datos.id_empleado);
    const anterior = await mongoDb.collection('cargas_diarias').findOne({ id_empleado: datos.id_empleado, fecha }, { session });
    const cargados = [...(anterior?.items || [])];
    const items = [];
    for (const i of datos.items) {
      const p = await mongoDb.collection('catalogo').findOne({ id_producto: i.id_producto, activo: true }, { session });
      exigir(p && esBalon(p), 'La carga solo admite balones activos de 5, 11, 15 o 45 kg.', 400);
      let fila = cargados.find(f => f.id_producto === i.id_producto);
      if (!fila) { fila = { id_producto: i.id_producto, cantidad_cargada: 0, id_carga: await siguienteId('id_carga', session) }; cargados.push(fila); }
      fila.cantidad_cargada += i.cantidad_cargada;
      exigir(fila.cantidad_cargada <= 999999999, 'La cantidad diaria excede el limite permitido.');
      items.push({ id_producto: i.id_producto, nombre: p.nombre, cantidad_agregada: i.cantidad_cargada, cantidad_cargada: fila.cantidad_cargada });
    }
    await mongoDb.collection('cargas_diarias').updateOne({ id_empleado: datos.id_empleado, fecha }, { $set: { items: cargados.sort((a, b) => a.id_producto - b.id_producto) } }, { upsert: true, session });
    await auditar(session, 'CARGA_DIARIA', usuario, { id_empleado: datos.id_empleado, fecha, items });
    return { id_empleado: datos.id_empleado, fecha, items };
  });
}
export async function listarCargas(filtros) {
  const fecha = filtros.fecha || fechaActual();
  const docs = await mongoDb.collection('cargas_diarias').find({ fecha, ...(filtros.id_empleado ? { id_empleado: filtros.id_empleado } : {}) }).sort({ id_empleado: 1 }).toArray();
  const cargas = [];
  for (const doc of docs) {
    const e = await mongoDb.collection('empleados').findOne({ id_empleado: doc.id_empleado });
    for (const i of doc.items) {
      const p = await mongoDb.collection('catalogo').findOne({ id_producto: i.id_producto });
      cargas.push({ id_carga: i.id_carga, id_empleado: doc.id_empleado, repartidor: e.nombre,
        id_producto: i.id_producto, producto: p.nombre, peso: p.atributos.peso_kg, cantidad_cargada: i.cantidad_cargada });
    }
  }
  return { fecha, cargas };
}
export async function cerrar(usuario, datos, clave) {
  return idempotente(`control:${usuario.id_usuario}`, clave, { tipo: 'CIERRE', ...datos }, async session => {
    const fecha = datos.fecha || fechaActual();
    exigir(fecha <= fechaActual(), 'No puedes cerrar una fecha futura.');
    await asegurarDiaAbierto(session, usuario.id_empleado, fecha);
    const sinResolver = await pendientes(session, usuario.id_empleado);
    exigir(sinResolver.length === 0, `No puedes cerrar: quedan ${sinResolver.length} pedidos propios sin resolver.`, 409);
    const abierto = await reporte(session, usuario.id_empleado, fecha);
    const devoluciones = new Map(datos.devueltos.map(i => [i.id_producto, i.devuelto]));
    exigir(abierto.balones.every(b => devoluciones.has(b.id_producto)), 'Debes declarar devuelto para cada producto cargado o vendido, aunque sea cero.');
    const base = new Map(abierto.balones.map(b => [b.id_producto, b]));
    for (const [id] of devoluciones) if (!base.has(id)) {
      const p = await mongoDb.collection('catalogo').findOne({ id_producto: id }, { session });
      exigir(p && esBalon(p), 'Una devolucion no corresponde a un balon conocido.');
      base.set(id, { id_producto: id, cargado: 0, vendido: 0 });
    }
    const entregado = pesos(centavos(datos.entregado_efectivo) + centavos(datos.entregado_transferencia));
    exigir(centavos(entregado) <= 999999999999n && centavos(abierto.ventas.total) <= 999999999999n, 'El total del cierre supera el limite permitido.');
    const soloMontos = (esperado, entregado) => ({ esperado, entregado, diferencia: diferencia(entregado, esperado) });
    const dinero = { efectivo: soloMontos(abierto.ventas.efectivo, datos.entregado_efectivo),
      transferencia: soloMontos(abierto.ventas.transferencia, datos.entregado_transferencia), total: soloMontos(abierto.ventas.total, entregado) };
    const balones = [...base.values()].map(b => ({ id_producto: b.id_producto, cargado: b.cargado, vendido: b.vendido,
      devuelto: devoluciones.get(b.id_producto), diferencia: b.vendido + devoluciones.get(b.id_producto) - b.cargado }));
    const id_cierre = await siguienteId('id_cierre', session);
    await mongoDb.collection('cierres_caja').insertOne({ fecha, id_empleado: usuario.id_empleado, id_cierre,
      dinero, balones, observacion: datos.observacion || '', cerrado_en: new Date() }, { session });
    const salida = await reporte(session, usuario.id_empleado, fecha);
    await auditar(session, 'CIERRE_CAJA', usuario, { id_cierre, id_empleado: usuario.id_empleado, fecha, estado: salida.estado, dinero: salida.dinero, balones: salida.balones });
    return salida;
  });
}
export async function cuadratura(filtros) {
  const fecha = filtros.fecha || fechaActual();
  return transaccion(async session => {
    const personas = await mongoDb.collection('empleados').find(filtros.id_empleado ? { id_empleado: filtros.id_empleado } : {}, { session }).sort({ id_empleado: 1 }).toArray();
    const repartidores = [];
    for (const p of personas) {
      const historico = p.rol === 'REPARTIDOR' || await mongoDb.collection('cargas_diarias').findOne({ id_empleado: p.id_empleado, fecha }, { session }) ||
        await mongoDb.collection('cierres_caja').findOne({ id_empleado: p.id_empleado, fecha }, { session }) ||
        await mongoDb.collection('pedidos').findOne({ id_empleado: p.id_empleado, estado_pago: 'COBRADA', fecha_cobro: rangoDia(fecha) }, { session });
      if (historico) repartidores.push(await reporte(session, p.id_empleado, fecha));
    }
    return { fecha, repartidores, resumen: { abiertos: repartidores.filter(r => r.estado === 'ABIERTO').length,
      cerrados: repartidores.filter(r => r.cierre).length, con_descuadre: repartidores.filter(r => r.descuadre).length } };
  });
}
export const cierrePropio = (usuario, fecha) => transaccion(session => reporte(session, usuario.id_empleado, fecha || fechaActual()));
