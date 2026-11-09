import { exigir } from '../middlewares/validar.js';

// Toda operación monetaria usa enteros BigInt en centavos. Number solo en la frontera JSON.
export function centavos(valor) {
  const s = String(valor);
  exigir(/^-?\d+(?:\.\d{1,2})?$/.test(s), 'El monto debe tener hasta dos decimales.');
  const negativo = s.startsWith('-');
  const [entero, decimal = ''] = s.replace(/^-/, '').split('.');
  const n = BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0'));
  return negativo ? -n : n;
}
export function pesos(n) {
  const signo = n < 0n ? '-' : '';
  const positivo = n < 0n ? -n : n;
  return Number(`${signo}${positivo / 100n}.${String(positivo % 100n).padStart(2, '0')}`);
}
export function calcular(items) {
  const bases = items.map(i => centavos(i.precio_unitario) * BigInt(i.cantidad));
  const subtotal = bases.reduce((a, b) => a + b, 0n);
  exigir(subtotal <= 999999999900n, 'El importe de la venta supera el limite permitido.');
  const descuento = subtotal >= 3000000n ? (subtotal + 5n) / 10n : 0n;
  let asignado = 0n;
  const lineas = items.map((item, i) => {
    const parte = i === items.length - 1 ? descuento - asignado : descuento * bases[i] / subtotal;
    asignado += parte;
    return { ...item, subtotal: pesos(bases[i]), descuento: pesos(parte), total: pesos(bases[i] - parte) };
  });
  return { subtotal: pesos(subtotal), descuento: pesos(descuento), total: pesos(subtotal - descuento), lineas };
}
export function sumar(filas, campo) { return pesos(filas.reduce((n, f) => n + centavos(f[campo]), 0n)); }
export function diferencia(entregado, esperado) { return pesos(centavos(entregado) - centavos(esperado)); }
