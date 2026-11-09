import { test, expect } from '@playwright/test';
import { telefonoPrueba } from './datos.js';
test.skip(!process.env.E2E_REAL, 'Activar E2E_REAL=1 para bases demo.');
async function api(request, method, path, body, token) {
  const r = await request.fetch(`/api${path}`, {
    method,
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
test('pedido telefónico sin cuenta: formulario corto, repetición de teléfono y registro posterior', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const marca = Date.now();
  const tel = telefonoPrueba();
  const nombre = `Llamada Sin Cuenta ${marca}`;
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('admin@demo.gasalpaso.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('GasPasoDemo2026!');
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/pedidos$/);
  const token = await page.evaluate(() =>
    sessionStorage.getItem('gas-al-paso.token'),
  );
  const p = await api(
    request,
    'POST',
    '/catalogo',
    {
      nombre: `Gas Telefono UI ${marca}`,
      descripcion: 'Prueba telefono',
      categoria: 'GAS',
      peso: 11,
      precio: 15000,
      stock: 20,
    },
    token,
  );
  await page.goto('/admin/llamada');
  await expect(page.getByLabel('Correo electrónico')).toHaveCount(0);
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Revisar pedido telefónico', exact: true })
    .click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  async function llenar(calle) {
    await page.getByLabel('Nombre', { exact: true }).fill(nombre);
    await page.getByLabel('Teléfono', { exact: true }).fill(`+56 ${tel}`);
    await page.getByLabel('Calle', { exact: true }).fill(calle);
    await page.getByLabel('Número', { exact: true }).fill('12');
    await page.getByLabel('Comuna', { exact: true }).selectOption('1');
    await page.getByLabel('Referencia (opcional)').fill('Entrada lateral');
    await page.getByLabel('Buscar productos', { exact: true }).fill(p.nombre);
    await page
      .getByRole('button', { name: 'Buscar productos', exact: true })
      .click();
    await page.getByLabel(`Cantidad de ${p.nombre}`, { exact: true }).fill('2');
  }
  await llenar('Primera Casa');
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath('formulario-telefono.png'),
    fullPage: true,
  });
  let solicitudes = 0;
  const claves = [];
  await page.route('**/api/pedidos/telefonico', async (ruta) => {
    claves.push(ruta.request().headers()['idempotency-key']);
    const r = await ruta.fetch();
    if (solicitudes++ === 0) {
      expect(r.status()).toBe(201);
      await ruta.fulfill({
        status: 503,
        json: { mensaje: 'Respuesta interrumpida de prueba.' },
      });
    } else await ruta.fulfill({ response: r });
  });
  await page
    .getByRole('button', { name: 'Revisar pedido telefónico', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear pedido telefónico', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Respuesta interrumpida');
  await page.reload();
  await page
    .getByRole('button', { name: 'Reintentar misma solicitud', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/pedidos\/[a-f0-9]{24}$/);
  expect(claves[0]).toBe(claves[1]);
  const primero = await api(
    request,
    'GET',
    `/pedidos/${page.url().split('/').at(-1)}`,
    undefined,
    token,
  );
  expect(primero.cliente.telefono).toBe(tel);
  expect((await api(request, 'GET', `/catalogo/${p.id_producto}`)).stock).toBe(
    18,
  );
  await page.goto('/admin/llamada');
  await llenar('Segunda Casa');
  await page
    .getByRole('button', { name: 'Revisar pedido telefónico', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear pedido telefónico', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/pedidos\/[a-f0-9]{24}$/);
  const segundo = await api(
    request,
    'GET',
    `/pedidos/${page.url().split('/').at(-1)}`,
    undefined,
    token,
  );
  expect(segundo.cliente.id_cliente).toBe(primero.cliente.id_cliente);
  expect(segundo.direccion_entrega.calle).toBe('Segunda Casa');
  await page.screenshot({
    path: test.info().outputPath('pedido-sin-cuenta.png'),
    fullPage: true,
  });
  const usuario = await api(request, 'POST', '/auth/registro', {
    nombre,
    telefono: tel,
    email: `telefono-ui-${marca}@demo.test`,
    password: 'TelefonoDemo2026!',
    direccion_principal: 'Mi casa web 1',
    id_comuna: 1,
  });
  expect(usuario.usuario.id_cliente).toBe(primero.cliente.id_cliente);
  const sesion = await api(request, 'POST', '/auth/login', {
    email: `telefono-ui-${marca}@demo.test`,
    password: 'TelefonoDemo2026!',
  });
  const mios = await api(
    request,
    'GET',
    '/pedidos/mios',
    undefined,
    sesion.token,
  );
  expect(mios.some((x) => x._id === primero._id)).toBe(true);
  expect(mios.some((x) => x._id === segundo._id)).toBe(true);
  expect(errores).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
