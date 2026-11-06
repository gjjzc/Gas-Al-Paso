import { campos, exigir, texto, entero } from './validar.js';

export const estadosPedido = ['RECIBIDO', 'ASIGNADO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'];
export function metodoPago(valor) {
  exigir(['EFECTIVO', 'TRANSFERENCIA'].includes(valor), 'Indica EFECTIVO o TRANSFERENCIA como metodo de pago.');
  return valor;
}
export function direccion(valor) {
  campos(valor, ['calle', 'numero', 'id_comuna', 'referencia'], ['calle', 'numero', 'id_comuna']);
  return { calle: texto(valor.calle, 'calle', 150), numero: texto(valor.numero, 'numero', 20),
    id_comuna: entero(valor.id_comuna, 'id_comuna'), referencia: valor.referencia === undefined ? '' : texto(valor.referencia, 'referencia', 200, 0) };
}
export function lineas(valor) {
  exigir(Array.isArray(valor) && valor.length >= 1 && valor.length <= 50, 'items debe contener entre 1 y 50 productos.');
  const items = valor.map(item => {
    campos(item, ['id_producto', 'cantidad'], ['id_producto', 'cantidad']);
    return { id_producto: entero(item.id_producto, 'id_producto'), cantidad: entero(item.cantidad, 'cantidad', 1, 9999) };
  });
  exigir(new Set(items.map(item => item.id_producto)).size === items.length, 'Cada producto debe aparecer una sola vez.');
  return items.sort((a,b) => a.id_producto-b.id_producto);
}
export function idPedido(valor) {
  exigir(typeof valor === 'string' && /^[0-9a-fA-F]{24}$/.test(valor), 'Identificador de pedido invalido.');
  return valor.toLowerCase();
}
export function claveIdempotencia(valor) {
  if (valor === undefined) return undefined;
  exigir(typeof valor === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(valor), 'Idempotency-Key debe tener de 1 a 100 caracteres: letras, numeros, punto, guion o dos puntos.');
  return valor;
}
export function fechaDia(valor) {
  if (valor === undefined) return undefined;
  exigir(typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor), 'fecha debe tener formato AAAA-MM-DD.');
  exigir(Number(valor.slice(0,4)) >= 1 && valor !== '9999-12-31', 'Fecha fuera del rango permitido.');
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  exigir(!Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0,10) === valor, 'Fecha inexistente.');
  return valor;
}
