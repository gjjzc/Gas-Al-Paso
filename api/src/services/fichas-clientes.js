import { mongoDb } from '../config/databases.js';
import { transaccion } from './transacciones.js';
import { auditar } from './auditoria.js';
import { presentarCliente, validarComuna, resolverDireccion, principal, direccionTexto } from './clientes.js';
import { exigir } from '../middlewares/validar.js';

async function fila(id, session) {
  const c = await mongoDb.collection('clientes').findOne({ id_cliente: id }, { session });
  exigir(c, 'Cliente no encontrado.', 404); return c;
}
async function estadisticas(id) {
  const [r] = await mongoDb.collection('pedidos').aggregate([
    { $match: { 'cliente.id_cliente': id } },
    { $group: { _id: null, cantidad_pedidos: { $sum: 1 }, fecha_ultimo_pedido: { $max: '$creado_en' } } },
  ]).toArray();
  return { cantidad_pedidos: r?.cantidad_pedidos || 0, fecha_ultimo_pedido: r?.fecha_ultimo_pedido || null };
}
export async function buscar(telefono) {
  const docs = await mongoDb.collection('clientes').aggregate([
    { $match: { telefono: { $regex: telefono } } }, { $addFields: { exacto: { $eq: ['$telefono', telefono] } } },
    { $sort: { exacto: -1, nombre: 1, id_cliente: 1 } }, { $limit: 10 },
  ]).toArray();
  const filas = [];
  for (const d of docs) filas.push({ ...await presentarCliente(d), ...await estadisticas(d.id_cliente) });
  return filas;
}
function sugerencia(c, nombreComuna) {
  const d = c.direccion_principal;
  return d.numero ? { calle: d.calle, numero: d.numero, id_comuna: d.comuna, comuna: nombreComuna, referencia: d.referencia } : null;
}
export async function obtener(id) {
  const c = await fila(id);
  const publicado = await presentarCliente(c);
  const pedidos = await mongoDb.collection('pedidos').find({ 'cliente.id_cliente': id }, {
    projection: { id_venta: 1, estado: 1, creado_en: 1, total: 1, canal: 1, direccion_entrega: 1, metodo_cobro: 1 },
  }).sort({ creado_en: -1, _id: -1 }).limit(10).toArray();
  let direccion = sugerencia(c, publicado.comuna);
  if (!direccion) {
    const anterior = await mongoDb.collection('pedidos').findOne({ 'cliente.id_cliente': id,
      'direccion_entrega.id_comuna': c.direccion_principal.comuna,
      $expr: { $eq: [{ $concat: ['$direccion_entrega.calle', ' ', '$direccion_entrega.numero'] }, { $literal: direccionTexto(c.direccion_principal) }] },
    }, { sort: { creado_en: -1, _id: -1 } });
    if (anterior) direccion = anterior.direccion_entrega;
  }
  return { ...publicado, ...await estadisticas(id), direccion_entrega_sugerida: direccion,
    pedidos_recientes: pedidos.map(p => ({ ...p, _id: p._id.toHexString() })) };
}
export async function editar(id, datos, usuario) {
  const c = await transaccion(async session => {
    const anterior = await fila(id, session);
    const cambios = {};
    if (datos.nombre !== undefined) cambios.nombre = datos.nombre;
    if (datos.direccion) cambios.direccion_principal = principal(await resolverDireccion(session, datos.direccion));
    else if (datos.direccion_principal !== undefined || datos.id_comuna !== undefined) {
      const comuna = datos.id_comuna ?? anterior.direccion_principal.comuna;
      await validarComuna(session, comuna);
      cambios.direccion_principal = { calle: datos.direccion_principal ?? direccionTexto(anterior.direccion_principal), numero: '', comuna, referencia: '' };
    }
    await mongoDb.collection('clientes').updateOne({ _id: anterior._id }, { $set: cambios, $inc: { version: 1 } }, { session });
    const nuevo = { ...anterior, ...cambios };
    const resumir = c => ({ nombre: c.nombre, direccion_principal: direccionTexto(c.direccion_principal), id_comuna: c.direccion_principal.comuna });
    await auditar(session, 'CLIENTE_ACTUALIZADO', usuario, { id_cliente: id, campos: Object.keys(datos), antes: resumir(anterior), despues: resumir(nuevo) });
    return nuevo;
  });
  const salida = await presentarCliente(c);
  return { ...salida, direccion_entrega_sugerida: sugerencia(c, salida.comuna), sincronizacion: 'OK' };
}
