import { mongoDb, conectarMongo } from '../config/databases.js';
import { consultar, conConexion, transaccion } from './oracle.js';
import { leerPedido } from './ventas.js';
import { encolar, auditar, estadoSincronizacion } from './sincronizacion.js';
import { exigir } from '../middlewares/validar.js';
import { asegurarDiaAbierto } from './jornada.js';

function puedeVer(usuario, venta, pedido) {
  return usuario.rol === 'ADMIN' ||
    (usuario.rol === 'CLIENTE' && venta.id_cliente === usuario.id_cliente) ||
    (usuario.rol === 'REPARTIDOR' && venta.id_empleado === usuario.id_empleado && pedido.repartidor?.id_empleado === usuario.id_empleado);
}
async function cargar(c, id, bloquear = false) {
  const [venta] = await consultar(c, `SELECT id_venta,id_cliente,id_empleado,subtotal,descuento,total_venta,estado_pago,metodo_pago
    FROM Venta WHERE id_pedido_mongo=:id AND estado_registro='CONFIRMADA'${bloquear ? ' FOR UPDATE' : ''}`, { id });
  exigir(venta, 'Pedido no encontrado.', 404);
  const pedido = await leerPedido(c, venta.id_venta);
  // Incluso las fixtures antiguas toman cantidades/precios del detalle relacional.
  const nombres = new Map((pedido.items || []).map(item => [item.id_producto, item.nombre]));
  const detalles = await consultar(c, `SELECT d.id_producto,d.cantidad,d.precio_unitario,p.nombre
    FROM Detalle_venta d JOIN Productos p ON p.id_producto=d.id_producto
    WHERE d.id_venta=:id ORDER BY d.id_producto`, { id: venta.id_venta });
  const items = detalles.map(item => ({ ...item, nombre: nombres.get(item.id_producto) || item.nombre }));
  return { venta, pedido: { ...pedido, _id: id, id_venta: venta.id_venta, items,
    cliente: { ...pedido.cliente, id_cliente: venta.id_cliente }, subtotal: venta.subtotal, descuento: venta.descuento, total: venta.total_venta,
    estado_pago: venta.estado_pago, metodo_pago: venta.estado_pago === 'COBRADA' ? venta.metodo_pago : null } };
}
async function pendientes(c, id) {
  return (await consultar(c, 'SELECT id_evento FROM Pendiente_Mongo WHERE id_venta=:id', { id })).map(e => e.id_evento);
}
async function sinCambios(c, pedido) { return { pedido, eventos: await pendientes(c, pedido.id_venta) }; }
async function guardar(c, pedido, estado, usuario) {
  const nuevo = { ...pedido, estado, version: (pedido.version || 1)+1,
    historial_estados: [...pedido.historial_estados, { estado, fecha: new Date().toISOString(), por: usuario.id_usuario }] };
  return { pedido: nuevo, eventos: [await encolar(c, 'PEDIDO_GUARDAR', nuevo, pedido.id_venta)] };
}
async function responder(resultado) {
  return { ...resultado.pedido, sincronizacion: await estadoSincronizacion(resultado.eventos) };
}
export async function obtener(usuario, id) {
  return conConexion(async c => {
    const { venta, pedido } = await cargar(c, id);
    exigir(puedeVer(usuario, venta, pedido), 'Pedido no encontrado.', 404);
    const [r] = await consultar(c, "SELECT COUNT(*) cantidad FROM Pendiente_Mongo WHERE id_venta=:id AND estado='PENDIENTE'", { id: venta.id_venta });
    return { ...pedido, sincronizacion: r.cantidad ? 'PENDIENTE' : 'OK' };
  });
}
export async function listar(usuario, filtros) {
  const consulta = {};
  if (usuario.rol === 'CLIENTE') consulta['cliente.id_cliente'] = usuario.id_cliente;
  if (usuario.rol === 'REPARTIDOR') consulta['repartidor.id_empleado'] = usuario.id_empleado;
  if (filtros.estado) consulta.estado = filtros.estado;
  if (filtros.fecha) consulta.creado_en = { $gte: new Date(`${filtros.fecha}T00:00:00.000Z`),
    $lt: new Date(new Date(`${filtros.fecha}T00:00:00.000Z`).getTime()+86400000) };
  if (filtros.comuna) {
    let nombre = filtros.comuna;
    if (/^\d+$/.test(nombre)) {
      const [comuna] = await conConexion(c => consultar(c, 'SELECT nombre FROM Comuna WHERE id_comuna=:id', { id: Number(nombre) }));
      if (!comuna) return [];
      nombre = comuna.nombre;
    }
    consulta['direccion_entrega.comuna'] = nombre;
  }
  await conectarMongo();
  const docs = await mongoDb.collection('pedidos').find(consulta).sort({ creado_en: -1, _id: -1 }).skip(filtros.offset).limit(filtros.limite).toArray();
  return conConexion(async c => {
    const visibles = [];
    for (const doc of docs) {
      try {
        const { venta, pedido } = await cargar(c, doc._id.toHexString());
        // No revelar una direccion a un repartidor anterior durante el desfase de Mongo.
        if (puedeVer(usuario, venta, pedido) && (!filtros.estado || pedido.estado === filtros.estado)) visibles.push(pedido);
      } catch (error) { if (error.estado !== 404) throw error; }
    }
    return visibles;
  });
}
export async function asignar(usuario, id, empleado) {
  const resultado = await transaccion(async c => {
    const { pedido } = await cargar(c, id, true);
    exigir(['RECIBIDO', 'ASIGNADO'].includes(pedido.estado), 'Solo se asignan o reasignan pedidos RECIBIDOS o ASIGNADOS.', 409);
    const [repartidor] = await consultar(c, `SELECT e.id_empleado,e.nombre FROM Empleado e JOIN Usuario u ON u.id_empleado=e.id_empleado
      WHERE e.id_empleado=:id AND u.rol='REPARTIDOR' AND u.activo=1`, { id: empleado });
    exigir(repartidor, 'Repartidor activo no encontrado.', 404);
    if (pedido.estado === 'ASIGNADO' && pedido.repartidor?.id_empleado === empleado) return sinCambios(c, pedido);
    await asegurarDiaAbierto(c, empleado);
    await c.execute('BEGIN PkgVentas.AsignarRepartidor(:venta,:empleado); END;', { venta: pedido.id_venta, empleado });
    const cambio = await guardar(c, { ...pedido, repartidor }, 'ASIGNADO', usuario);
    cambio.eventos.push(await auditar(c, 'ASIGNACION', usuario, { id_venta: pedido.id_venta, id_pedido: id, id_empleado: empleado }));
    return cambio;
  });
  return responder(resultado);
}
export async function cambiarEstado(usuario, id, estado, metodo) {
  const resultado = await transaccion(async c => {
    const { venta, pedido } = await cargar(c, id, true);
    exigir(puedeVer(usuario, venta, pedido), 'Pedido no encontrado.', 404);
    if (pedido.estado === estado) {
      exigir(estado !== 'ENTREGADO' || pedido.metodo_pago === metodo, 'El pedido ya fue cobrado con otro metodo.', 409);
      return sinCambios(c, pedido);
    }
    const siguiente = { ASIGNADO: 'EN_CAMINO', EN_CAMINO: 'ENTREGADO' };
    exigir(siguiente[pedido.estado] === estado, `Transicion no permitida: ${pedido.estado} -> ${estado}.`, 409);
    exigir(pedido.repartidor, 'El pedido necesita un repartidor asignado.', 409);
    await asegurarDiaAbierto(c, venta.id_empleado);
    if (estado === 'ENTREGADO') {
      await c.execute('BEGIN PkgVentas.CobrarVenta(:venta,:metodo); END;', { venta: pedido.id_venta, metodo });
      pedido.estado_pago = 'COBRADA';
      pedido.metodo_pago = metodo;
    }
    const cambio = await guardar(c, pedido, estado, usuario);
    cambio.eventos.push(await auditar(c, estado === 'ENTREGADO' ? 'ENTREGA' : 'CAMBIO_ESTADO', usuario,
      { id_venta: pedido.id_venta, id_pedido: id, estado, total: pedido.total, metodo_pago: pedido.metodo_pago }));
    return cambio;
  });
  return responder(resultado);
}
export async function cancelar(usuario, id) {
  const resultado = await transaccion(async c => {
    const { venta, pedido } = await cargar(c, id, true);
    exigir(usuario.rol === 'ADMIN' || (usuario.rol === 'CLIENTE' && venta.id_cliente === usuario.id_cliente), 'Pedido no encontrado.', 404);
    if (pedido.estado === 'CANCELADO') return sinCambios(c, pedido);
    exigir(pedido.estado !== 'ENTREGADO', 'Un pedido ENTREGADO no puede cancelarse.', 409);
    exigir(usuario.rol === 'ADMIN' || pedido.estado === 'RECIBIDO', 'Solo puedes cancelar tu pedido mientras este RECIBIDO.', 409);
    const stocks = [];
    for (const item of [...pedido.items].sort((a,b) => a.id_producto-b.id_producto)) {
      const [producto] = await consultar(c, 'SELECT stock FROM Productos WHERE id_producto=:id FOR UPDATE', { id: item.id_producto });
      stocks.push({ id_producto: item.id_producto, antes: producto.stock });
    }
    await c.execute('BEGIN AnularVenta(:id); END;', { id: pedido.id_venta });
    pedido.estado_pago = 'ANULADA';
    pedido.metodo_pago = null;
    const cambio = await guardar(c, pedido, 'CANCELADO', usuario);
    for (const stock of stocks) {
      const [actual] = await consultar(c, 'SELECT stock FROM Productos WHERE id_producto=:id', { id: stock.id_producto });
      if (actual.stock !== stock.antes) cambio.eventos.push(await auditar(c, 'CAMBIO_STOCK', usuario,
        { ...stock, despues: actual.stock, id_venta: pedido.id_venta, motivo: 'CANCELACION' }));
    }
    cambio.eventos.push(await auditar(c, 'CANCELACION', usuario, { id_venta: pedido.id_venta, id_pedido: id }));
    return cambio;
  });
  return responder(resultado);
}
export async function eliminar(usuario, id) {
  const resultado = await transaccion(async c => {
    const { pedido } = await cargar(c, id, true);
    exigir(pedido.estado === 'CANCELADO', 'Solo se pueden eliminar pedidos CANCELADOS.', 409);
    const eventos = [await encolar(c, 'PEDIDO_ELIMINAR', { _id: id, id_venta: pedido.id_venta }, pedido.id_venta)];
    eventos.push(await auditar(c, 'ELIMINACION_PEDIDO', usuario, { id_venta: pedido.id_venta, id_pedido: id }));
    return { id_venta: pedido.id_venta, eventos };
  });
  return { mensaje: 'Pedido cancelado eliminado; la venta y su auditoria se conservan.', _id: id,
    id_venta: resultado.id_venta, sincronizacion: await estadoSincronizacion(resultado.eventos) };
}
