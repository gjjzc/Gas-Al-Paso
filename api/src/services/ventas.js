import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { mongoDb } from '../config/databases.js';
import { siguienteId } from './contadores.js';
import { auditar } from './auditoria.js';
import { transaccion } from './transacciones.js';
import { idempotente } from './idempotencia.js';
import { conCarritoBloqueado, leerCarrito, limpiarConsumido } from './carrito.js';
import { resolverDireccion, buscarOCrearCliente, principal } from './clientes.js';
import { asegurarDiaAbierto, fechaActual, rangoDia } from './jornada.js';
import { repartidorActivo } from './empleados.js';
import { pedidoPublico, ventaPublica } from './documentos.js';
import { calcular, sumar } from './importes.js';
import { imagenLocal } from './imagenes.js';
import { exigir } from '../middlewares/validar.js';
import { ErrorHttp } from '../middlewares/errores.js';

async function salida(p, session) { return p.canal === 'TARREO' ? ventaPublica(p, session) : pedidoPublico(p); }
export async function crearVenta(usuario, canal, datos, claveSolicitada) {
  const ejecutar = async () => {
    // Un reintento con clave explícita puede recuperar el pedido aun con el carrito vacío.
    const snapshot = canal === 'WEB' ? await leerCarrito(usuario.id_cliente) : null;
    const clave = claveSolicitada || (snapshot ? `carrito:${snapshot.version}` : randomUUID());
    try {
      const r = await idempotente(`ventas:${usuario.id_usuario}`, clave, { canal, ...datos }, async session => {
        let items = datos.items;
        if (canal === 'WEB') {
          exigir(snapshot?.items.length, 'Tu carrito esta vacio o vencido.', 409);
          exigir(!await mongoDb.collection('idempotencia').findOne({ alcance: 'carrito', clave: snapshot.version }, { session }),
            'Esta version del carrito ya fue confirmada. Consulta tus pedidos o reintenta con su clave original.', 409);
          items = snapshot.items;
        }
        let id_empleado = usuario.id_empleado;
        if (canal === 'WEB') {
          const admin = await mongoDb.collection('usuarios').findOne({ rol: 'ADMIN', activo: true }, { sort: { id_usuario: 1 }, session });
          exigir(admin, 'No hay un administrador activo para recibir el pedido.', 409);
          id_empleado = admin.id_empleado;
        }
        let repartidor = null;
        if (canal === 'TARREO') {
          await asegurarDiaAbierto(session, id_empleado);
          repartidor = await repartidorActivo(session, id_empleado);
        }
        const direccion = canal === 'TARREO' ? null : await resolverDireccion(session, datos.direccion_entrega, canal === 'WEB' ? 404 : 400);
        let cliente = null, clienteCreado = false;
        if (canal !== 'TARREO') {
          let c;
          if (datos.cliente_nuevo) {
            const r = await buscarOCrearCliente(session, { ...datos.cliente_nuevo, principal: principal(direccion) });
            c = r.cliente; clienteCreado = r.creado;
          } else c = await mongoDb.collection('clientes').findOne({ id_cliente: canal === 'WEB' ? usuario.id_cliente : datos.id_cliente }, { session });
          exigir(c, 'Cliente no encontrado.', 404);
          cliente = { id_cliente: c.id_cliente, nombre: c.nombre, telefono: c.telefono };
          if (datos.guardar_como_principal) await mongoDb.collection('clientes').updateOne({ _id: c._id }, { $set: { direccion_principal: principal(direccion) }, $inc: { version: 1 } }, { session });
        }
        const ahora = new Date();
        const id_venta = await siguienteId('id_venta', session);
        const lineas = [];
        for (const i of [...items].sort((a, b) => a.id_producto - b.id_producto)) {
          const p = await mongoDb.collection('catalogo').findOneAndUpdate({ id_producto: i.id_producto, activo: true, stock: { $gte: i.cantidad } },
            { $inc: { stock: -i.cantidad }, $set: { actualizado_en: ahora } }, { session, returnDocument: 'before' });
          if (!p) {
            const actual = await mongoDb.collection('catalogo').findOne({ id_producto: i.id_producto }, { session });
            exigir(actual, `Producto ${i.id_producto} no encontrado.`, 404);
            exigir(actual.activo, `El producto ${actual.nombre} esta inactivo.`, 409);
            const e = new ErrorHttp(409, `Stock insuficiente para ${actual.nombre}. Disponible: ${actual.stock}; solicitado: ${i.cantidad}.`);
            e.stock = { id_producto: actual.id_producto, disponible: actual.stock, solicitado: i.cantidad }; throw e;
          }
          lineas.push({ id_producto: p.id_producto, nombre: p.nombre, cantidad: i.cantidad, precio_unitario: p.precio, imagen: imagenLocal(p.imagen) });
          await auditar(session, 'CAMBIO_STOCK', usuario, { id_producto: p.id_producto, antes: p.stock, despues: p.stock - i.cantidad, id_venta, motivo: canal });
        }
        const totales = calcular(lineas);
        const cobrada = canal === 'TARREO';
        const p = { _id: new ObjectId(), id_venta, canal, cliente, direccion_entrega: direccion, id_empleado,
          items: totales.lineas, subtotal: totales.subtotal, descuento: totales.descuento, total: totales.total,
          estado: cobrada ? 'ENTREGADO' : 'RECIBIDO', estado_pago: cobrada ? 'COBRADA' : 'PENDIENTE',
          metodo_pago: cobrada ? datos.metodo_pago : null, metodo_cobro: datos.metodo_pago || datos.metodo_cobro,
          repartidor, historial_estados: [{ estado: cobrada ? 'ENTREGADO' : 'RECIBIDO', fecha: ahora, por: usuario.id_usuario }],
          creado_en: ahora, fecha_cobro: cobrada ? ahora : null, version: 1 };
        await mongoDb.collection('pedidos').insertOne(p, { session });
        if (canal === 'WEB') await mongoDb.collection('idempotencia').insertOne({ alcance: 'carrito', clave: snapshot.version,
          resultado: { id_venta }, creado_en: ahora }, { session });
        if (canal === 'LLAMADA') await auditar(session, 'PEDIDO_TELEFONICO', usuario, {
          id_cliente: cliente.id_cliente, id_venta, id_pedido: p._id.toHexString(), cliente_creado: clienteCreado,
          guardar_como_principal: Boolean(datos.guardar_como_principal), id_comuna: direccion.id_comuna,
        });
        await auditar(session, cobrada ? 'VENTA_TARREO' : 'VENTA_CREADA', usuario, {
          id_venta, canal, items: lineas, subtotal: p.subtotal, descuento: p.descuento, total: p.total,
          estado_pago: p.estado_pago, metodo_pago: p.metodo_pago, id_empleado,
        });
        return salida(p, session);
      }, async (anterior, session) => {
        const p = await mongoDb.collection('pedidos').findOne({ id_venta: anterior.id_venta }, { session });
        exigir(p, 'Esta solicitud ya creo una venta cuyo pedido fue eliminado. Usa otra clave para una venta nueva.', 409);
        return salida(p, session);
      });
      // Redis no participa en la transacción financiera. Solo borrar la versión consumida.
      // Si está caído, el registro de consumo impide confirmar de nuevo esa versión.
      if (snapshot && !r.reutilizada) await limpiarConsumido(usuario.id_cliente, snapshot).catch(() => {});
      return r;
    } catch (error) {
      if (error.stock) await transaccion(session => auditar(session, 'VENTA_RECHAZADA_STOCK', usuario, { canal, ...error.stock })).catch(() => {});
      throw error;
    }
  };
  return canal === 'WEB' ? conCarritoBloqueado(usuario.id_cliente, ejecutar) : ejecutar();
}
export async function ventasDia(usuario, filtros) {
  const fecha = filtros.fecha || fechaActual();
  let id = filtros.id_empleado;
  if (usuario.rol === 'REPARTIDOR') {
    exigir(!id || id === usuario.id_empleado, 'Solo puedes consultar tus propias ventas.', 403); id = usuario.id_empleado;
  }
  return transaccion(async session => {
    const filas = await mongoDb.collection('pedidos').find({
      $or: [{ fecha_cobro: rangoDia(fecha) }, { estado_pago: { $ne: 'COBRADA' }, creado_en: rangoDia(fecha), fecha_cobro: null }],
      ...(id ? { id_empleado: id } : {}), ...(filtros.canal ? { canal: filtros.canal } : {}),
      ...(filtros.estado_pago ? { estado_pago: filtros.estado_pago } : {}),
    }, { session }).sort({ id_venta: -1 }).toArray();
    const pagadas = filas.filter(p => p.estado_pago === 'COBRADA');
    const resumen = { cantidad_ventas: filas.length, cobradas: pagadas.length, total_cobrado: sumar(pagadas, 'total'),
      descuentos_cobrados: sumar(pagadas, 'descuento'), efectivo: sumar(pagadas.filter(p => p.metodo_pago === 'EFECTIVO'), 'total'),
      transferencia: sumar(pagadas.filter(p => p.metodo_pago === 'TRANSFERENCIA'), 'total') };
    const ventas = [];
    for (const p of filas.slice(filtros.offset, filtros.offset + filtros.limite)) ventas.push(await ventaPublica(p, session));
    return { fecha, ventas, resumen };
  });
}
