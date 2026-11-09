import { mongoDb } from '../config/databases.js';
import { calcular } from './importes.js';
export function pedidoPublico(p) {
  const { id_empleado, ...doc } = p;
  return { ...doc, _id: p._id.toHexString(), items: p.items.map(({ subtotal, descuento, total, ...i }) => i), sincronizacion: 'OK' };
}
export async function ventaPublica(p, session) {
  const e = !p.repartidor && await mongoDb.collection('empleados').findOne({ id_empleado: p.id_empleado }, { session });
  const items = p.items.every(i => i.subtotal !== undefined) ? p.items : calcular(p.items).lineas;
  return { id_venta: p.id_venta, fecha_venta: p.creado_en, canal: p.canal, id_cliente: p.cliente?.id_cliente || null,
    id_empleado: p.id_empleado, repartidor_nombre: p.repartidor?.nombre || e?.nombre || null,
    estado_pago: p.estado_pago, metodo_pago: p.metodo_pago, fecha_cobro: p.fecha_cobro,
    subtotal: p.subtotal, descuento: p.descuento, total: p.total,
    id_pedido_mongo: p.canal === 'TARREO' ? null : p._id.toHexString(),
    items: items.map(({ id_producto, nombre, cantidad, precio_unitario, subtotal, descuento, total }) => ({ id_producto, nombre, cantidad, precio_unitario, subtotal, descuento, total })) };
}
