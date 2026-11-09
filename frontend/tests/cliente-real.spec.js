import { claveTemporal } from './datos.js';
import { telefonoTemporal } from './datos.js';
import { test, expect } from '@playwright/test';
test.skip(
  !process.env.E2E_REAL,
  'Activar E2E_REAL=1 para probar contra Mongo y Redis de desarrollo.',
);
async function pedir(request, method, ruta, body, token) {
  const respuesta = await request.fetch(`/api${ruta}`, {
    method,
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  expect(
    respuesta.ok(),
    `${method} ${ruta}: ${await respuesta.text()}`,
  ).toBeTruthy();
  return respuesta.json();
}
test('cliente real: registro, descuento, reintento sin duplicar, seguimiento y cancelación', async ({
  page,
  request,
}) => {
  const marca = Date.now();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const admin = await pedir(request, 'POST', '/auth/login', {
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  const rep = await pedir(
    request,
    'POST',
    '/usuarios',
    {
      nombre: `Repartidor UI ${marca}`,
      email: `rep-ui-${marca}@operaciones.test`,
      password: claveTemporal('control-1'),
      rol: 'REPARTIDOR',
      comunas: [1],
    },
    admin.token,
  );
  const loginRep = await pedir(request, 'POST', '/auth/login', {
    email: rep.email,
    password: claveTemporal('control-1'),
  });
  // Producto propio evita depender de stock agotado por verificaciones anteriores.
  const producto = await pedir(
    request,
    'POST',
    '/catalogo',
    {
      nombre: `Gas UI ${marca}`,
      descripcion: 'Balón de integración de interfaz',
      categoria: 'GAS',
      peso: 11,
      precio: 15000,
      stock: 10,
    },
    admin.token,
  );
  await page.goto('/registro');
  await page.getByLabel('Nombre completo').fill(`Cliente UI ${marca}`);
  await page.getByLabel('Teléfono').fill(telefonoTemporal());
  await page
    .getByLabel('Correo electrónico')
    .fill(`cliente-ui-${marca}@operaciones.test`);
  await page.getByLabel('Comuna', { exact: true }).selectOption('1');
  await page.getByLabel('Dirección principal').fill('Calle Los Aromos 123');
  await page.getByLabel('Contraseña', { exact: true }).fill(claveTemporal('control-1'));
  await page.getByLabel('Repetir contraseña').fill(claveTemporal('control-1'));
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Tu cuenta está lista');
  await page
    .getByLabel('Correo electrónico')
    .fill(`cliente-ui-${marca}@operaciones.test`);
  await page.getByLabel('Contraseña', { exact: true }).fill(claveTemporal('control-1'));
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/catalogo$/);
  // Paginar hasta el producto de integración (las suites preservan datos previos).
  for (
    let i = 0;
    i < 50 &&
    !(await page
      .getByRole('heading', { name: producto.nombre, exact: true })
      .count());
    i++
  ) {
    const siguiente = page.getByRole('button', { name: 'Siguiente' });
    await expect(siguiente).toBeEnabled();
    const respuesta = page.waitForResponse((r) =>
      r.url().includes('/api/catalogo?'),
    );
    await siguiente.click();
    await respuesta;
    await expect(page.getByRole('status')).toHaveCount(0);
  }
  const tarjeta = page
    .getByRole('article')
    .filter({
      has: page.getByRole('heading', { name: producto.nombre, exact: true }),
    });
  await tarjeta.getByRole('button', { name: /Agregar al carrito/ }).click();
  await expect(page.getByRole('status')).toContainText('se agregó');
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /Carrito/ })
    .click();
  await page
    .getByRole('button', { name: `Agregar una unidad de ${producto.nombre}` })
    .click();
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  await page.reload();
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  await page.getByRole('link', { name: 'Continuar con el pedido' }).click();
  await page.getByLabel('Calle', { exact: true }).fill('Los Robles');
  await page.getByLabel('Número', { exact: true }).fill('123');
  await page.getByLabel('Comuna de entrega').selectOption('1');
  await page.getByLabel('Referencia (opcional)').fill('Portón azul');
  // La API confirma, pero simulamos perder la respuesta. El reintento debe usar la misma clave.
  const claves = [];
  let primera = true;
  await page.route('**/api/pedidos', async (ruta) => {
    if (ruta.request().method() !== 'POST') return ruta.continue();
    claves.push(ruta.request().headers()['idempotency-key']);
    const respuesta = await ruta.fetch();
    if (primera) {
      primera = false;
      expect(respuesta.status()).toBe(201);
      await ruta.fulfill({
        status: 503,
        json: { mensaje: 'Respuesta interrumpida durante la operación.' },
      });
    } else {
      expect(respuesta.status()).toBe(200);
      await ruta.fulfill({ response: respuesta });
    }
  });
  await page
    .getByRole('button', { name: 'Confirmar pedido', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Respuesta interrumpida');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Reintentar confirmación' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar confirmación' }).click();
  await expect(page).toHaveURL(/\/pedidos\/[a-f0-9]{24}$/);
  expect(claves).toHaveLength(2);
  expect(claves[0]).toBe(claves[1]);
  const id = page.url().split('/').at(-1);
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  expect(
    (await pedir(request, 'GET', `/catalogo/${producto.id_producto}`)).stock,
  ).toBe(8);
  await pedir(
    request,
    'PATCH',
    `/pedidos/${id}/asignar`,
    { id_empleado: rep.id_empleado },
    admin.token,
  );
  await expect(
    page.getByText('Estado actual: Asignado', { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await pedir(
    request,
    'PATCH',
    `/pedidos/${id}/estado`,
    { estado: 'EN_CAMINO' },
    loginRep.token,
  );
  await expect(
    page.getByText('Estado actual: En camino', { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await pedir(
    request,
    'PATCH',
    `/pedidos/${id}/estado`,
    { estado: 'ENTREGADO', metodo_pago: 'EFECTIVO' },
    loginRep.token,
  );
  await expect(
    page.getByText('Estado actual: Entregado', { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await expect(page.locator('.historial li')).toHaveCount(4);
  await expect(page.getByText('Pago: Cobrado · Efectivo')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancelar pedido' }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText('Estado actual: Entregado', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Segundo pedido se cancela como cliente y repone una sola unidad.
  const token = await page.evaluate(() =>
    sessionStorage.getItem('gas-al-paso.token'),
  );
  await pedir(
    request,
    'POST',
    '/carrito/items',
    { id_producto: producto.id_producto, cantidad: 1 },
    token,
  );
  const segundo = await pedir(
    request,
    'POST',
    '/pedidos',
    {
      direccion_entrega: { calle: 'Otra', numero: '20', id_comuna: 1 },
      metodo_cobro: 'TRANSFERENCIA',
    },
    token,
  );
  await page.goto(`/pedidos/${segundo._id}`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(
    page.getByText('Estado actual: Cancelado', { exact: true }),
  ).toBeVisible();
  expect(
    (await pedir(request, 'GET', `/catalogo/${producto.id_producto}`)).stock,
  ).toBe(8);
  await page.goto('/pedidos');
  await expect(
    page.getByText(`PEDIDO #${segundo.id_venta}`, { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await page.goto('/pedidos');
  await expect(page).toHaveURL(/\/login$/);
  expect(errores).toEqual([]);
});
