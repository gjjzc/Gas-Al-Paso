// Ejecutar con mongosh; idempotente, no recrea colecciones ni modifica ventas.
const baseImagenes = db.getSiblingDB('gas_al_paso');
const rutasImagenes = new Map([
  ['Gas 5kg', '/productos/balon-5kg.jpg'],
  ['Gas 11kg', '/productos/balon-11kg.jpg'],
  ['Gas 15kg', '/productos/balon-15kg.jpg'],
  ['Gas 45kg', '/productos/balon-45kg.jpg'],
  ['Regulador de gas', '/productos/regulador.jpg'],
  ['Manguera de gas', '/productos/manguera.jpg'],
]);
const rutaImagenValida = /^\/productos\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|avif|gif|svg)$/i;
let imagenesModificadas = 0;
for (const p of baseImagenes.catalogo.find({}, { nombre: 1, imagen: 1 })) {
  // Preservar rutas locales elegidas por el ADMIN y cambios de otros campos.
  if (rutaImagenValida.test(p.imagen || '')) continue;
  const imagen = rutasImagenes.get(p.nombre) || '/llama.svg';
  if (p.imagen === imagen) continue;
  imagenesModificadas += baseImagenes.catalogo.updateOne({ _id: p._id, imagen: p.imagen ?? null }, { $set: { imagen } }).modifiedCount;
}
print(`Imágenes locales: ${imagenesModificadas} documentos actualizados. Pedidos/carritos conservados.`);
