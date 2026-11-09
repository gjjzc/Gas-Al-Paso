// Solo metadatos de imágenes. No toca dinero, stock, clientes, pedidos ni carritos.
const baseProfesional = db.getSiblingDB('gas_al_paso');
const fotosProfesionales = new Map([
  ['Gas 5kg','balon-5kg'],['Gas 11kg','balon-11kg'],['Gas 15kg','balon-15kg'],
  ['Gas 45kg','balon-45kg'],['Regulador de gas','regulador'],['Manguera de gas','manguera'],
]);
const nombresPrevios = new Map([...fotosProfesionales.values()].map(n=>[`/productos/${n}.jpg`,`/productos/${n}.png`]));
let actualizadosProfesional = 0;
for (const producto of baseProfesional.catalogo.find({}, {nombre:1,imagen:1})) {
  let imagen = nombresPrevios.get(producto.imagen);
  const rutaLocal = typeof producto.imagen === 'string' && /^\/productos\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|avif|gif|svg)$/i.test(producto.imagen);
  const sinFotoLocal = !rutaLocal;
  if (!imagen && sinFotoLocal) imagen = fotosProfesionales.has(producto.nombre) ? `/productos/${fotosProfesionales.get(producto.nombre)}.png` : '/llama.svg';
  if (!imagen || imagen === producto.imagen) continue;
  actualizadosProfesional += baseProfesional.catalogo.updateOne({_id:producto._id,imagen:producto.imagen ?? null},{$set:{imagen}}).modifiedCount;
}
print(`Imágenes profesionales: ${actualizadosProfesional} rutas actualizadas. Sin cambios en ventas ni pedidos.`);
