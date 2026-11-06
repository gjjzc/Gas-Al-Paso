import { test, expect } from '@playwright/test';
const rep = {
  id_usuario: 990,
  id_empleado: 990,
  nombre: 'Repartidor de interfaz',
  rol: 'REPARTIDOR',
};
const abierto = {
  fecha: '2026-11-06',
  id_empleado: 990,
  estado: 'ABIERTO',
  cierre: null,
  pedidos_sin_resolver: [],
  balones: [],
  ventas: { cantidad: 0 },
  dinero: {
    efectivo: { esperado: 0 },
    transferencia: { esperado: 0 },
    total: { esperado: 0 },
  },
};
async function iniciar(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('gas-al-paso.token', 'token-interfaz');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
  });
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: rep }));
}
test('no se puede preparar un cierre si falla la consulta de lo esperado', async ({
  page,
}) => {
  await iniciar(page);
  let falla = true;
  await page.route('**/api/cierre', (r) =>
    r.fulfill(
      falla
        ? {
            status: 503,
            json: { mensaje: 'Oracle temporalmente no disponible.' },
          }
        : { json: abierto },
    ),
  );
  await page.goto('/repartidor/cierre');
  await expect(page.getByRole('alert')).toContainText('Oracle temporalmente');
  await expect(
    page.getByRole('button', { name: 'Revisar cierre de jornada' }),
  ).toHaveCount(0);
  falla = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByLabel('Efectivo entregado')).toBeVisible();
});
test('tarreo sin stock muestra error, mantiene selección y libera confirmación', async ({
  page,
}) => {
  await iniciar(page);
  await page.route('**/api/cierre', (r) => r.fulfill({ json: abierto }));
  await page.route('**/api/catalogo?**', (r) =>
    r.fulfill({
      json: [
        {
          id_producto: 2,
          nombre: 'Gas interfaz',
          peso: 11,
          categoria: 'GAS',
          precio: 15000,
          stock: 2,
        },
      ],
    }),
  );
  await page.route('**/api/ventas/calle', (r) =>
    r.fulfill({
      status: 409,
      json: {
        mensaje:
          'Stock insuficiente para Gas interfaz. Disponible: 0; solicitado: 2.',
      },
    }),
  );
  await page.goto('/repartidor/tarreo');
  await page.getByLabel('Cantidad de Gas interfaz', { exact: true }).fill('2');
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  await page.getByRole('button', { name: 'Revisar y confirmar venta' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar venta cobrada' })
    .click();
  await expect(page.getByRole('alert')).toContainText('Stock insuficiente');
  await expect(
    page.getByLabel('Cantidad de Gas interfaz', { exact: true }),
  ).toHaveValue('2');
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('gas-al-paso.operacion.990.tarreo'),
    ),
  ).toBeNull();
});
test('CLIENTE no accede a la jornada del repartidor y conserva su navegación', async ({
  page,
}) => {
  await iniciar(page);
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        id_usuario: 991,
        id_cliente: 991,
        nombre: 'Cliente interfaz',
        rol: 'CLIENTE',
      },
    }),
  );
  await page.route('**/api/carrito', (r) =>
    r.fulfill({ json: { items: [], total: 0, subtotal: 0, descuento: 0 } }),
  );
  await page.goto('/repartidor/cierre');
  await expect(
    page.getByRole('heading', { name: 'Esta sección es para repartidores' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Jornada del repartidor' }),
  ).toHaveCount(0);
});
