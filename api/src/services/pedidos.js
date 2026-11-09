import { ObjectId } from 'mongodb';
import { mongoDb } from '../config/databases.js';
import { transaccion } from './transacciones.js';
import { auditar } from './auditoria.js';
import { pedidoPublico } from './documentos.js';
import { asegurarDiaAbierto, rangoDia } from './jornada.js';
import { repartidorActivo } from './empleados.js';
import { exigir } from '../middlewares/validar.js';

function puedeVer(u, p) { return u.rol === 'ADMIN' || (u.rol === 'CLIENTE' && p.cliente?.id_cliente === u.id_cliente) ||
  (u.rol === 'REPARTIDOR' && p.repartidor?.id_empleado === u.id_empleado && p.id_empleado === u.id_empleado); }
async function cargar(id, session) {
  const p = await mongoDb.collection('pedidos').findOne({ _id: new ObjectId(id), canal: { $ne: 'TARREO' } }, { session });
  exigir(p, 'Pedido no encontrado.', 404); return p;
}
async function guardar(session, p, cambios, estado, usuario) {
  const ahora = new Date();
  await mongoDb.collection('pedidos').updateOne({ _id: p._id, version: p.version }, {
    $set: { ...cambios, estado }, $inc: { version: 1 }, $push: { historial_estados: { estado, fecha: ahora, por: usuario.id_usuario } },
  }, { session });
  return { ...p, ...cambios, estado, version: p.version + 1,
    historial_estados: [...p.historial_estados, { estado, fecha: ahora, por: usuario.id_usuario }] };
}
export async function obtener(usuario, id) {
  const p = await cargar(id); exigir(puedeVer(usuario, p), 'Pedido no encontrado.', 404); return pedidoPublico(p);
}
export async function listar(usuario, filtros) {
  const q = { canal: { $ne: 'TARREO' } };
  if (usuario.rol === 'CLIENTE') q['cliente.id_cliente'] = usuario.id_cliente;
  if (usuario.rol === 'REPARTIDOR') q['repartidor.id_empleado'] = usuario.id_empleado;
  if (filtros.estado) q.estado = filtros.estado;
  if (filtros.fecha) q.creado_en = rangoDia(filtros.fecha);
  if (filtros.comuna) q[/^\d+$/.test(filtros.comuna) ? 'direccion_entrega.id_comuna' : 'direccion_entrega.comuna'] = /^\d+$/.test(filtros.comuna) ? Number(filtros.comuna) : filtros.comuna;
  return (await mongoDb.collection('pedidos').find(q).sort({ creado_en: -1, _id: -1 }).skip(filtros.offset).limit(filtros.limite).toArray()).map(pedidoPublico);
}
export async function asignar(usuario, id, empleado) {
  return transaccion(async session => {
    const p = await cargar(id, session);
    exigir(['RECIBIDO', 'ASIGNADO'].includes(p.estado), 'Solo se asignan o reasignan pedidos RECIBIDOS o ASIGNADOS.', 409);
    const repartidor = await repartidorActivo(session, empleado);
    if (p.estado === 'ASIGNADO' && p.repartidor?.id_empleado === empleado) return pedidoPublico(p);
    await asegurarDiaAbierto(session, empleado);
    const nuevo = await guardar(session, p, { repartidor, id_empleado: empleado }, 'ASIGNADO', usuario);
    await auditar(session, 'ASIGNACION', usuario, { id_venta: p.id_venta, id_pedido: id, id_empleado: empleado });
    return pedidoPublico(nuevo);
  });
}
export async function cambiarEstado(usuario, id, estado, metodo) {
  return transaccion(async session => {
    const p = await cargar(id, session);
    exigir(puedeVer(usuario, p), 'Pedido no encontrado.', 404);
    if (p.estado === estado) {
      exigir(estado !== 'ENTREGADO' || p.metodo_pago === metodo, 'El pedido ya fue cobrado con otro metodo.', 409);
      return pedidoPublico(p);
    }
    exigir(({ ASIGNADO: 'EN_CAMINO', EN_CAMINO: 'ENTREGADO' })[p.estado] === estado, `Transicion no permitida: ${p.estado} -> ${estado}.`, 409);
    exigir(p.repartidor, 'El pedido necesita un repartidor asignado.', 409);
    await asegurarDiaAbierto(session, p.id_empleado);
    const cambios = estado === 'ENTREGADO' ? { estado_pago: 'COBRADA', metodo_pago: metodo, fecha_cobro: new Date() } : {};
    const nuevo = await guardar(session, p, cambios, estado, usuario);
    await auditar(session, estado === 'ENTREGADO' ? 'ENTREGA' : 'CAMBIO_ESTADO', usuario, { id_venta: p.id_venta, id_pedido: id, estado, total: p.total, metodo_pago: nuevo.metodo_pago });
    return pedidoPublico(nuevo);
  });
}
export async function cancelar(usuario, id) {
  return transaccion(async session => {
    const p = await cargar(id, session);
    exigir(usuario.rol === 'ADMIN' || (usuario.rol === 'CLIENTE' && p.cliente.id_cliente === usuario.id_cliente), 'Pedido no encontrado.', 404);
    if (p.estado === 'CANCELADO') return pedidoPublico(p);
    exigir(p.estado !== 'ENTREGADO', 'Un pedido ENTREGADO no puede cancelarse.', 409);
    exigir(usuario.rol === 'ADMIN' || p.estado === 'RECIBIDO', 'Solo puedes cancelar tu pedido mientras este RECIBIDO.', 409);
    const ahora = new Date();
    const r = await mongoDb.collection('pedidos').updateOne({ _id: p._id, estado: { $nin: ['ENTREGADO', 'CANCELADO'] } }, {
      $set: { estado: 'CANCELADO', estado_pago: 'ANULADA', metodo_pago: null }, $inc: { version: 1 },
      $push: { historial_estados: { estado: 'CANCELADO', fecha: ahora, por: usuario.id_usuario } },
    }, { session });
    exigir(r.matchedCount === 1, 'La venta no permite esa operacion en su estado actual.', 409);
    for (const i of [...p.items].sort((a, b) => a.id_producto - b.id_producto)) {
      const antes = await mongoDb.collection('catalogo').findOneAndUpdate({ id_producto: i.id_producto }, { $inc: { stock: i.cantidad }, $set: { actualizado_en: ahora } }, { session, returnDocument: 'before' });
      exigir(antes, `Producto ${i.id_producto} no encontrado.`, 404);
      await auditar(session, 'CAMBIO_STOCK', usuario, { id_producto: i.id_producto, antes: antes.stock, despues: antes.stock + i.cantidad, id_venta: p.id_venta, motivo: 'CANCELACION' });
    }
    await auditar(session, 'CANCELACION', usuario, { id_venta: p.id_venta, id_pedido: id });
    return pedidoPublico(await cargar(id, session));
  });
}
export async function eliminar(usuario, id) {
  return transaccion(async session => {
    const p = await cargar(id, session);
    exigir(p.estado === 'CANCELADO', 'Solo se pueden eliminar pedidos CANCELADOS.', 409);
    const { id_venta, canal, cliente, items, subtotal, descuento, total, estado, creado_en, fecha_cobro, historial_estados } = p;
    await auditar(session, 'PEDIDO_ELIMINADO', usuario, { id_pedido: id, id_venta, canal, cliente, items, subtotal, descuento, total, estado, creado_en, fecha_cobro, historial_estados });
    await mongoDb.collection('pedidos').deleteOne({ _id: p._id, estado: 'CANCELADO' }, { session });
    return { mensaje: 'Pedido cancelado eliminado; se conserva una copia resumida en auditoria.', _id: id, id_venta, sincronizacion: 'OK' };
  });
}
