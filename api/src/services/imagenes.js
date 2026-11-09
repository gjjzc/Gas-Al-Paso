import { mongoDb, conectarMongo } from '../config/databases.js';
export const IMAGEN_REEMPLAZO = '/llama.svg';
export function rutaImagen(valor) {
  return typeof valor === 'string' && (valor === IMAGEN_REEMPLAZO ||
    /^\/productos\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|avif|gif|svg)$/i.test(valor));
}
export function imagenLocal(valor) { return rutaImagen(valor) ? valor : IMAGEN_REEMPLAZO; }
// Las fotos son metadatos: su indisponibilidad nunca debe impedir guardar/cobrar una venta.
export async function conImagenes(items) {
  const ids = items.filter(i => !rutaImagen(i.imagen)).map(i => i.id_producto);
  let porId = new Map();
  if (ids.length) {
    try {
      await conectarMongo();
      const docs = await mongoDb.collection('catalogo').find({ id_producto: { $in: ids } },
        { projection: { id_producto: 1, imagen: 1 } }).toArray();
      porId = new Map(docs.map(p => [p.id_producto, imagenLocal(p.imagen)]));
    } catch { /* Conservar venta y ofrecer el SVG existente cuando Mongo no responde. */ }
  }
  return items.map(i => ({ ...i, imagen: rutaImagen(i.imagen) ? i.imagen : porId.get(i.id_producto) || IMAGEN_REEMPLAZO }));
}
