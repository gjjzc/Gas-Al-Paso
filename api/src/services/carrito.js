import { conImagenes, imagenLocal } from './imagenes.js';
import { randomUUID, createHash } from 'node:crypto';
import { mongoDb, conectarMongo } from '../config/databases.js';
import { transaccion, consultar, conConexion } from './oracle.js';
import { exigir, entero } from '../middlewares/validar.js';

export function importes(items) {
  // Centavos enteros: evita acumular errores binarios si Oracle contiene decimales.
  const centavos = items.reduce((suma, item) => suma + Math.round(item.precio_unitario*100)*item.cantidad, 0);
  const descuento = centavos >= 3000000 ? Math.round(centavos/10) : 0;
  return { subtotal: centavos/100, descuento: descuento/100, total: (centavos-descuento)/100 };
}
export async function bloquearCliente(c, id) {
  const [cliente] = await consultar(c, 'SELECT id_cliente,nombre,telefono,id_comuna FROM Cliente WHERE id_cliente=:id FOR UPDATE', { id });
  exigir(cliente, 'Cliente no encontrado.', 404);
  return cliente;
}
export async function leerCarrito(id) {
  // El monitor TTL no es inmediato: nunca aceptar un carrito cuya fecha ya expiro.
  await conectarMongo();
  return mongoDb.collection('carritos').findOne({ id_cliente: id, expira_en: { $gt: new Date() } });
}
export function versionCarrito(carrito) {
  const items = carrito.items.map(({ id_producto, cantidad }) => ({ id_producto, cantidad })).sort((a,b) => a.id_producto-b.id_producto);
  const version = carrito.version || createHash('sha256').update(JSON.stringify({ items, actualizado_en: carrito.actualizado_en })).digest('hex');
  return `${carrito._id.toHexString()}:${version}`;
}
async function disponible(c, id) {
  const carrito = await leerCarrito(id);
  if (!carrito) return null;
  const [consumido] = await consultar(c, 'SELECT id_venta FROM Solicitud_Venta WHERE carrito_version=:version', { version: versionCarrito(carrito) });
  return consumido ? null : carrito;
}
async function presentar(id, carrito) {
  const items = await conImagenes(carrito?.items || []);
  return { id_cliente: id, items, ...importes(items), version: carrito?.version || null,
    actualizado_en: carrito?.actualizado_en || null, expira_en: carrito?.expira_en || null };
}
export async function obtener(id) { return conConexion(async c => presentar(id, await disponible(c, id))); }
export async function modificar(usuario, accion, idProducto, cantidad) {
  return transaccion(async c => {
    // Serializa cambios de un mismo cliente y su confirmacion sin reservar stock.
    await bloquearCliente(c, usuario.id_cliente);
    const carrito = await disponible(c, usuario.id_cliente);
    if (accion === 'VACIAR') {
      await mongoDb.collection('carritos').deleteOne({ id_cliente: usuario.id_cliente });
      return presentar(usuario.id_cliente, null);
    }
    const items = (carrito?.items || []).map(item => ({ ...item }));
    const indice = items.findIndex(item => item.id_producto === idProducto);
    if (accion === 'QUITAR') {
      exigir(indice >= 0, 'El producto no esta en tu carrito.', 404);
      items.splice(indice, 1);
    } else {
      const [producto] = await consultar(c, 'SELECT nombre,valor_unitario,activo FROM Productos WHERE id_producto=:id', { id: idProducto });
      const catalogo = await mongoDb.collection('catalogo').findOne({ id_producto: idProducto, activo: true }, { projection: { _id: 1, imagen: 1 } });
      exigir(producto?.activo === 1 && catalogo, 'Producto activo no encontrado.', 404);
      if (accion === 'CAMBIAR') exigir(indice >= 0, 'El producto no esta en tu carrito.', 404);
      const nuevaCantidad = accion === 'AGREGAR' && indice >= 0 ? items[indice].cantidad+cantidad : cantidad;
      entero(nuevaCantidad, 'cantidad', 1, 9999);
      const item = { imagen: imagenLocal(catalogo.imagen), id_producto: idProducto, nombre: producto.nombre, cantidad: nuevaCantidad, precio_unitario: producto.valor_unitario };
      if (indice >= 0) items[indice] = item;
      else items.push(item);
    }
    exigir(items.length <= 50, 'El carrito admite hasta 50 productos distintos.');
    const ahora = new Date();
    const nuevo = { id_cliente: usuario.id_cliente, items: items.sort((a,b) => a.id_producto-b.id_producto),
      actualizado_en: ahora, expira_en: new Date(ahora.getTime()+30*60*1000), version: randomUUID() };
    await mongoDb.collection('carritos').updateOne({ id_cliente: usuario.id_cliente }, { $set: nuevo }, { upsert: true });
    return presentar(usuario.id_cliente, nuevo);
  });
}
