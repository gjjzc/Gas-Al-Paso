import { entero, exigir } from './validar.js';
export function dinero(valor, campo) {
  exigir(typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 9999999999.99 &&
    /^\d+(?:\.\d{1,2})?$/.test(String(valor)), `${campo} debe ser un monto no negativo con hasta dos decimales.`);
  return valor;
}
export function cantidades(items, campo, minimo = 0) {
  exigir(Array.isArray(items) && items.length <= 100, `${campo} debe ser una lista de hasta 100 productos.`);
  const filas = items.map(item => {
    exigir(item && typeof item === 'object' && !Array.isArray(item) &&
      Object.keys(item).every(k => ['id_producto', campo].includes(k)), 'La linea contiene campos no permitidos.');
    return { id_producto: entero(item.id_producto, 'id_producto'), [campo]: entero(item[campo], campo, minimo) };
  });
  exigir(new Set(filas.map(f => f.id_producto)).size === filas.length, 'No repitas productos.');
  return filas.sort((a,b) => a.id_producto-b.id_producto);
}
