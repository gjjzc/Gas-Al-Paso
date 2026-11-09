import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, centavos, pesos, diferencia } from '../src/services/importes.js';
test('Umbral, redondeo exacto a centavos y valores de frontera', () => {
  for (const [precio, descuento] of [[29999.99, 0], [30000, 3000], [30000.04, 3000], [30000.05, 3000.01], [30001, 3000.1]]) {
    assert.equal(calcular([{ cantidad: 1, precio_unitario: precio }]).descuento, descuento);
  }
});
test('Prorrateo trunca; última línea absorbe el resto', () => {
  const r = calcular([{ cantidad: 1, precio_unitario: 10000.01 }, { cantidad: 1, precio_unitario: 20000.04 }]);
  assert.equal(r.descuento, 3000.01);
  assert.equal(r.lineas[0].descuento, 1000);
  assert.equal(r.lineas[1].descuento, 2000.01);
  assert.equal(r.lineas.reduce((n, i) => n + centavos(i.total), 0n), centavos(r.total));
});
test('Diferencias firmadas y conversiones sin operaciones binarias de dinero', () => {
  assert.equal(diferencia(0.3, 0.2), 0.1);
  assert.equal(diferencia(0.2, 0.3), -0.1);
  assert.equal(pesos(centavos(9999999999.99)), 9999999999.99);
  assert.throws(() => centavos(1.001));
});
