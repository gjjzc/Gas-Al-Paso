// Vista previa con centavos enteros; el total definitivo siempre viene de la API.
export function calcularImportes(items) {
  const subtotal = items.reduce(
    (s, i) => s + Math.round(i.precio_unitario * 100) * i.cantidad,
    0,
  );
  const descuento = subtotal >= 3000000 ? Math.round(subtotal / 10) : 0;
  return {
    subtotal: subtotal / 100,
    descuento: descuento / 100,
    total: (subtotal - descuento) / 100,
  };
}
