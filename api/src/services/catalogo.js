import { mongoDb, redisClient } from '../config/databases.js';
import { imagenLocal } from './imagenes.js';
import { transaccion } from './transacciones.js';
import { siguienteId } from './contadores.js';
import { auditar } from './auditoria.js';
import { exigir } from '../middlewares/validar.js';
export const CLAVE_CATALOGO = 'catalogo:publico';
export function publicar(p) {
  const { _id, ...datos } = p;
  return { ...datos, peso: p.atributos?.peso_kg, imagen: imagenLocal(p.imagen) };
}
export async function invalidarCatalogo() {
  // La operación Mongo ya está confirmada; una caída de la caché no revierte el negocio.
  try { await redisClient.del(CLAVE_CATALOGO); } catch { /* El TTL limita la vida de cualquier copia anterior. */ }
}
export async function listar({ limite, offset, categoria, incluirInactivos, buscar = '' }) {
  let filas;
  if (!incluirInactivos) {
    try { const cache = await redisClient.get(CLAVE_CATALOGO); if (cache) filas = JSON.parse(cache); } catch { /* Leer Mongo si la caché no está disponible. */ }
  }
  if (!filas) {
    filas = (await mongoDb.collection('catalogo').find(incluirInactivos ? {} : { activo: true }).sort({ id_producto: 1 }).toArray()).map(publicar);
    if (!incluirInactivos) try { await redisClient.set(CLAVE_CATALOGO, JSON.stringify(filas), { EX: 30 }); } catch { /* Caché opcional. */ }
  }
  return filas.filter(p => (!categoria || p.categoria === categoria) && `${p.nombre} ${p.descripcion}`.toLowerCase().includes(buscar.toLowerCase())).slice(offset, offset + limite);
}
export async function obtener(id, incluirInactivos = false) {
  const p = await mongoDb.collection('catalogo').findOne({ id_producto: id, ...(incluirInactivos ? {} : { activo: true }) });
  exigir(p, 'Producto no encontrado.', 404); return publicar(p);
}
export async function crear(datos, usuario) {
  const producto = await transaccion(async session => {
    const { peso, ...resto } = datos;
    const p = { ...resto, id_producto: await siguienteId('id_producto', session), imagen: imagenLocal(datos.imagen),
      atributos: { ...(datos.atributos || {}), peso_kg: peso }, activo: datos.activo ?? true, destacado: datos.destacado ?? false, actualizado_en: new Date() };
    await mongoDb.collection('catalogo').insertOne(p, { session });
    await auditar(session, 'CAMBIO_PRECIO', usuario, { id_producto: p.id_producto, antes: null, despues: p.precio, creacion: true });
    await auditar(session, 'CAMBIO_STOCK', usuario, { id_producto: p.id_producto, antes: null, despues: p.stock, creacion: true });
    return publicar(p);
  });
  await invalidarCatalogo(); return { ...producto, sincronizacion: 'OK' };
}
export async function editar(id, datos, usuario) {
  const p = await transaccion(async session => {
    const actual = await mongoDb.collection('catalogo').findOne({ id_producto: id }, { session });
    exigir(actual, 'Producto no encontrado.', 404);
    const { peso, ...cambios } = datos;
    if (datos.atributos !== undefined || peso !== undefined) cambios.atributos = {
      ...(datos.atributos ?? actual.atributos), peso_kg: peso ?? actual.atributos.peso_kg,
    };
    cambios.actualizado_en = new Date();
    await mongoDb.collection('catalogo').updateOne({ _id: actual._id }, { $set: cambios }, { session });
    // Cada actualización explícita del precio deja rastro, incluso si el valor coincide.
    for (const [campo, tipo] of [['precio', 'CAMBIO_PRECIO'], ['stock', 'CAMBIO_STOCK']]) {
      if (datos[campo] !== undefined && (campo === 'precio' || datos[campo] !== actual[campo])) await auditar(session, tipo, usuario, { id_producto: id, antes: actual[campo], despues: datos[campo] });
    }
    const campos = Object.keys(datos).filter(k => !['precio', 'stock', 'peso'].includes(k));
    if (campos.length) await auditar(session, 'EDICION_CATALOGO', usuario, { id_producto: id, campos });
    return publicar({ ...actual, ...cambios });
  });
  await invalidarCatalogo(); return { ...p, sincronizacion: 'OK' };
}
export async function eliminar(id, usuario) {
  await editar(id, { activo: false }, usuario);
  return { mensaje: 'Producto desactivado. Se conservan las ventas historicas.', id_producto: id, sincronizacion: 'OK' };
}
