import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import oracledb from 'oracledb';
import { mongoDb, conectarMongo } from '../config/databases.js';
import { transaccion, conConexion, consultar, salidaNumero } from './oracle.js';
import { encolar, auditar, estadoSincronizacion } from './sincronizacion.js';
import { bloquearCliente, leerCarrito, versionCarrito } from './carrito.js';
import { exigir } from '../middlewares/validar.js';
import { ErrorHttp } from '../middlewares/errores.js';
import { lineas } from '../middlewares/validar-ventas.js';
import { asegurarDiaAbierto } from './jornada.js';

function huella(valor) {
  return createHash('sha256').update(JSON.stringify(valor)).digest('hex');
}
export async function leerVenta(c, id) {
  const [venta] = await consultar(c, `SELECT v.id_venta,v.fecha_venta,v.canal,v.id_cliente,v.id_empleado,
    e.nombre repartidor_nombre,v.estado_pago,v.metodo_pago,v.fecha_cobro,v.subtotal,v.descuento,v.total_venta total,v.id_pedido_mongo
    FROM Venta v JOIN Empleado e ON e.id_empleado=v.id_empleado WHERE v.id_venta=:id`, { id });
  exigir(venta, 'Venta no encontrada.', 404);
  venta.items = await consultar(c, `SELECT d.id_producto,p.nombre,d.cantidad,d.precio_unitario,d.subtotal,d.descuento,d.total_venta total
    FROM Detalle_venta d JOIN Productos p ON p.id_producto=d.id_producto WHERE d.id_venta=:id ORDER BY d.id_producto`, { id });
  return venta;
}
export async function leerPedido(c, idVenta) {
  const [evento] = await consultar(c, `SELECT tipo,payload FROM Pendiente_Mongo
    WHERE id_venta=:id AND tipo IN ('PEDIDO_GUARDAR','PEDIDO_ELIMINAR')
    ORDER BY id_evento DESC FETCH NEXT 1 ROWS ONLY`, { id: idVenta }, { fetchInfo: { PAYLOAD: { type: oracledb.STRING } } });
  if (evento) {
    exigir(evento.tipo !== 'PEDIDO_ELIMINAR', 'Pedido no encontrado.', 404);
    return JSON.parse(evento.payload);
  }
  // Las fixtures de FASE 1 son previas a la cola de pedidos.
  const [venta] = await consultar(c, 'SELECT id_pedido_mongo FROM Venta WHERE id_venta=:id', { id: idVenta });
  if (venta?.id_pedido_mongo) await conectarMongo();
  const doc = venta?.id_pedido_mongo && await mongoDb.collection('pedidos').findOne({ _id: new ObjectId(venta.id_pedido_mongo) });
  exigir(doc, 'Pedido no encontrado.', 404);
  return { ...doc, _id: doc._id.toHexString(), version: doc.version || 1 };
}
async function solicitud(c, usuario, clave, hash, canal) {
  const [actual] = await consultar(c, 'SELECT id_venta,huella,canal FROM Solicitud_Venta WHERE id_usuario=:usuario AND clave=:clave',
    { usuario: usuario.id_usuario, clave });
  if (actual) {
    exigir(actual.huella === hash && actual.canal === canal, 'Idempotency-Key ya se uso con otros datos.', 409);
    exigir(actual.id_venta, 'La solicitud sigue en proceso. Reintenta con la misma clave.', 409);
  }
  return actual;
}
async function resultadoRepetido(c, actual, clave) {
  const venta = await leerVenta(c, actual.id_venta);
  let documento = venta;
  if (venta.canal !== 'TARREO') {
    try { documento = await leerPedido(c, venta.id_venta); }
    catch (error) {
      if (error.estado === 404) throw new ErrorHttp(409, 'Esta solicitud ya creo una venta cuyo pedido fue eliminado. Usa otra clave para una venta nueva.');
      throw error;
    }
  }
  const eventos = await consultar(c, 'SELECT id_evento FROM Pendiente_Mongo WHERE id_venta=:id', { id: venta.id_venta });
  return { documento, eventos: eventos.map(e => e.id_evento), clave, reutilizada: true };
}
async function datosCliente(c, id) {
  const [cliente] = await consultar(c, 'SELECT id_cliente,nombre,telefono FROM Cliente WHERE id_cliente=:id', { id });
  exigir(cliente, 'Cliente no encontrado.', 404);
  return cliente;
}
async function datosDireccion(c, datos) {
  const [comuna] = await consultar(c, 'SELECT nombre FROM Comuna WHERE id_comuna=:id', { id: datos.id_comuna });
  exigir(comuna, 'Comuna no encontrada.', 404);
  return { ...datos, comuna: comuna.nombre };
}
async function auditarRechazo(usuario, canal, error) {
  const id = await transaccion(c => auditar(c, 'VENTA_RECHAZADA_STOCK', usuario, { canal, ...error.stock }));
  await estadoSincronizacion([id]);
}
export async function crearVenta(usuario, canal, datos, claveSolicitada) {
  const hash = huella({ canal, ...datos });
  let resultado;
  try {
    resultado = await transaccion(async c => {
      if (canal === 'WEB') await bloquearCliente(c, usuario.id_cliente);
      if (claveSolicitada) {
        const actual = await solicitud(c, usuario, claveSolicitada, hash, canal);
        if (actual) return resultadoRepetido(c, actual, claveSolicitada);
      }
      let carrito;
      let carritoVersion = null;
      let items = datos.items;
      let clave = claveSolicitada;
      if (canal === 'WEB') {
        carrito = await leerCarrito(usuario.id_cliente);
        exigir(carrito?.items?.length, 'Tu carrito esta vacio o vencido.', 409);
        items = lineas(carrito.items.map(({ id_producto, cantidad }) => ({ id_producto, cantidad })));
        carritoVersion = versionCarrito(carrito);
        clave ||= `carrito:${carritoVersion}`;
      }
      clave ||= randomUUID();
      const actual = await solicitud(c, usuario, clave, hash, canal);
      if (actual) return resultadoRepetido(c, actual, clave);
      if (carritoVersion) {
        const [consumida] = await consultar(c, 'SELECT id_venta FROM Solicitud_Venta WHERE carrito_version=:version', { version: carritoVersion });
        exigir(!consumida, 'Esta version del carrito ya fue confirmada. Consulta tus pedidos o reintenta con su clave original.', 409);
      }
      try {
        await c.execute(`INSERT INTO Solicitud_Venta(id_usuario,clave,huella,canal,carrito_version)
          VALUES(:usuario,:clave,:hash,:canal,:version)`, { usuario: usuario.id_usuario, clave, hash, canal, version: carritoVersion });
      } catch (error) {
        if (error.errorNum === 1) error.solicitudRepetida = { clave, hash, canal };
        throw error;
      }
      let empleado = usuario.id_empleado;
      if (canal === 'WEB') {
        const [admin] = await consultar(c, "SELECT id_empleado FROM Usuario WHERE rol='ADMIN' AND activo=1 ORDER BY id_usuario FETCH NEXT 1 ROWS ONLY");
        exigir(admin, 'No hay un administrador activo para recibir el pedido.', 409);
        empleado = admin.id_empleado;
      }
      if (canal === 'TARREO') await asegurarDiaAbierto(c, empleado);
      const cliente = canal === 'TARREO' ? null : await datosCliente(c, canal === 'WEB' ? usuario.id_cliente : datos.id_cliente);
      const direccion = canal === 'TARREO' ? null : await datosDireccion(c, datos.direccion_entrega);
      const idMongo = canal === 'TARREO' ? null : new ObjectId().toHexString();
      const crear = await c.execute('BEGIN PkgVentas.CrearVenta(:empleado,:canal,:cliente,:metodo,:mongo,:id); END;', {
        empleado, canal, cliente: cliente?.id_cliente || null, metodo: datos.metodo_pago || datos.metodo_cobro,
        mongo: idMongo, id: salidaNumero(),
      });
      const idVenta = crear.outBinds.id;
      const snapshots = [];
      const stocks = [];
      let subtotal = 0;
      // Orden estable de bloqueos para reducir interbloqueos entre ventas concurrentes.
      for (const item of items) {
        const [producto] = await consultar(c, 'SELECT nombre,valor_unitario,stock,activo FROM Productos WHERE id_producto=:id FOR UPDATE', { id: item.id_producto });
        exigir(producto, `Producto ${item.id_producto} no encontrado.`, 404);
        exigir(producto.activo === 1, `El producto ${producto.nombre} esta inactivo.`, 409);
        subtotal += producto.valor_unitario*item.cantidad;
        exigir(subtotal <= 9999999999, 'El importe de la venta supera el limite permitido.');
        try {
          await c.execute('BEGIN PkgVentas.AgregarItem(:venta,:producto,:cantidad); END;',
            { venta: idVenta, producto: item.id_producto, cantidad: item.cantidad });
        } catch (error) {
          if (error.errorNum === 20003) {
            const rechazo = new ErrorHttp(409, `Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}; solicitado: ${item.cantidad}.`);
            rechazo.stock = { id_producto: item.id_producto, disponible: producto.stock, solicitado: item.cantidad };
            throw rechazo;
          }
          throw error;
        }
        snapshots.push({ ...item, nombre: producto.nombre, precio_unitario: producto.valor_unitario });
        stocks.push({ id_producto: item.id_producto, antes: producto.stock, despues: producto.stock-item.cantidad });
      }
      await c.execute('BEGIN PkgVentas.FinalizarVenta(:id); END;', { id: idVenta });
      await c.execute('UPDATE Solicitud_Venta SET id_venta=:venta WHERE id_usuario=:usuario AND clave=:clave',
        { venta: idVenta, usuario: usuario.id_usuario, clave });
      const venta = await leerVenta(c, idVenta);
      const eventos = [];
      let documento = venta;
      if (canal !== 'TARREO') {
        const ahora = new Date().toISOString();
        documento = { _id: idMongo, id_venta: idVenta, canal, cliente, direccion_entrega: direccion,
          metodo_cobro: datos.metodo_cobro, items: snapshots, subtotal: venta.subtotal,
          descuento: venta.descuento, total: venta.total, estado: 'RECIBIDO',
          estado_pago: venta.estado_pago, metodo_pago: null, repartidor: null,
          historial_estados: [{ estado: 'RECIBIDO', fecha: ahora, por: usuario.id_usuario }],
          creado_en: venta.fecha_venta.toISOString(), version: 1 };
        eventos.push(await encolar(c, 'PEDIDO_GUARDAR', documento, idVenta));
        if (carrito) eventos.push(await encolar(c, 'CARRITO_LIMPIAR', {
          id_cliente: usuario.id_cliente, version: carrito.version || null,
          actualizado_en: carrito.actualizado_en,
        }, idVenta));
      }
      for (const stock of stocks) eventos.push(await auditar(c, 'CAMBIO_STOCK', usuario, { ...stock, id_venta: idVenta, motivo: canal }));
      eventos.push(await auditar(c, canal === 'TARREO' ? 'VENTA_TARREO' : 'VENTA_CREADA', usuario,
        { id_venta: idVenta, canal, items: snapshots, subtotal: venta.subtotal, descuento: venta.descuento,
          total: venta.total, estado_pago: venta.estado_pago, metodo_pago: venta.metodo_pago, id_empleado: venta.id_empleado }));
      return { documento, eventos, clave, reutilizada: false };
    });
  } catch (error) {
    if (error.solicitudRepetida) {
      const { clave, hash: h, canal: ca } = error.solicitudRepetida;
      resultado = await conConexion(async c => {
        const actual = await solicitud(c, usuario, clave, h, ca);
        exigir(actual, 'La solicitud concurrente no se completo; reintenta con la misma clave.', 409);
        return resultadoRepetido(c, actual, clave);
      });
    } else {
      if (error.stock) await auditarRechazo(usuario, canal, error);
      throw error;
    }
  }
  return { ...resultado.documento, clave_idempotencia: resultado.clave, reutilizada: resultado.reutilizada,
    sincronizacion: await estadoSincronizacion(resultado.eventos) };
}

export async function ventasDia(usuario, filtros) {
  return conConexion(async c => {
    const [hoy] = await consultar(c, "SELECT TO_CHAR(SYSDATE,'YYYY-MM-DD') fecha FROM DUAL");
    const fecha = filtros.fecha || hoy.fecha;
    let empleado = filtros.id_empleado || null;
    if (usuario.rol === 'REPARTIDOR') {
      exigir(!empleado || empleado === usuario.id_empleado, 'Solo puedes consultar tus propias ventas.', 403);
      empleado = usuario.id_empleado;
    }
    const binds = { fecha, empleado, canal: filtros.canal || null, pago: filtros.estado_pago || null };
    const condicion = `estado_registro='CONFIRMADA'
      AND NVL(fecha_cobro,fecha_venta)>=TO_DATE(:fecha,'YYYY-MM-DD') AND NVL(fecha_cobro,fecha_venta)<TO_DATE(:fecha,'YYYY-MM-DD')+1
      AND (:empleado IS NULL OR id_empleado=:empleado) AND (:canal IS NULL OR canal=:canal)
      AND (:pago IS NULL OR estado_pago=:pago)`;
    const [resumen] = await consultar(c, `SELECT COUNT(*) cantidad_ventas,
      COUNT(CASE WHEN estado_pago='COBRADA' THEN 1 END) cobradas,
      NVL(SUM(CASE WHEN estado_pago='COBRADA' THEN total_venta ELSE 0 END),0) total_cobrado,
      NVL(SUM(CASE WHEN estado_pago='COBRADA' THEN descuento ELSE 0 END),0) descuentos_cobrados,
      NVL(SUM(CASE WHEN estado_pago='COBRADA' AND metodo_pago='EFECTIVO' THEN total_venta ELSE 0 END),0) efectivo,
      NVL(SUM(CASE WHEN estado_pago='COBRADA' AND metodo_pago='TRANSFERENCIA' THEN total_venta ELSE 0 END),0) transferencia
      FROM Venta WHERE ${condicion}`, binds);
    const filas = await consultar(c, `SELECT id_venta FROM Venta WHERE ${condicion}
      ORDER BY id_venta DESC OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`, { ...binds, limite: filtros.limite, offset: filtros.offset });
    const ventas = [];
    for (const fila of filas) ventas.push(await leerVenta(c, fila.id_venta));
    return { fecha, ventas, resumen };
  });
}
