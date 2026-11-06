import { ErrorHttp } from './errores.js';

export function exigir(condicion, mensaje, estado = 400) {
  if (!condicion) throw new ErrorHttp(estado, mensaje);
}
export function campos(cuerpo, permitidos, requeridos = []) {
  exigir(cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo), 'Debes enviar un objeto JSON.');
  exigir(Object.keys(cuerpo).every(campo => permitidos.includes(campo)), 'La solicitud contiene campos no permitidos.');
  exigir(requeridos.every(campo => Object.hasOwn(cuerpo, campo)), `Campos requeridos: ${requeridos.join(', ')}.`);
}
export function texto(valor, campo, maximo, minimo = 1) {
  exigir(typeof valor === 'string' && valor.trim().length >= minimo && valor.trim().length <= maximo,
    `${campo} debe ser texto de ${minimo} a ${maximo} caracteres.`);
  return valor.trim();
}
export function entero(valor, campo, minimo = 1, maximo = 999999999) {
  exigir(typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= minimo && valor <= maximo,
    `${campo} debe ser un entero entre ${minimo} y ${maximo}.`);
  return valor;
}
export function idRuta(valor) {
  exigir(typeof valor === 'string' && /^[1-9]\d{0,8}$/.test(valor), 'Identificador invalido.');
  return Number(valor);
}
export function correo(valor) {
  const email = texto(valor, 'email', 254).toLowerCase();
  exigir(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Email invalido.');
  return email;
}
export function password(valor, nuevo = true) {
  exigir(typeof valor === 'string' && valor.length >= (nuevo ? 8 : 1) && Buffer.byteLength(valor, 'utf8') <= 72,
    'La contrasena debe tener al menos 8 caracteres y no superar 72 bytes.');
  return valor;
}
export function booleano(valor, campo) {
  exigir(typeof valor === 'boolean', `${campo} debe ser true o false.`);
  return valor;
}
export function listaComunas(valor) {
  exigir(Array.isArray(valor) && valor.length <= 100, 'comunas debe ser una lista de hasta 100 identificadores.');
  const ids = valor.map(id => entero(id, 'id_comuna'));
  exigir(new Set(ids).size === ids.length, 'No repitas comunas.');
  return ids;
}
export function paginacion(query) {
  const leer = (valor, predeterminado, maximo) => {
    if (valor === undefined) return predeterminado;
    exigir(typeof valor === 'string' && /^\d{1,6}$/.test(valor), 'Paginacion invalida.');
    return entero(Number(valor), 'paginacion', 0, maximo);
  };
  return { limite: Math.max(1, leer(query.limite, 50, 100)), offset: leer(query.offset, 0, 100000) };
}
