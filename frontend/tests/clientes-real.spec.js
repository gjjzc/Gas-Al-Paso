import { test, expect } from '@playwright/test';
import { telefonoTemporal } from './datos.js';
test.skip(!process.env.E2E_REAL, 'Activar E2E_REAL=1 para bases de integración.');
async function api(request, method, path, body, token) {
  const r = await request.fetch(`/api${path}`, {
    method,
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function elegirProducto(page, nombre, cantidad) {
  await page.getByLabel('Buscar productos', { exact: true }).fill(nombre);
  await page
    .getByRole('button', { name: 'Buscar productos', exact: true })
    .click();
  await page
    .getByLabel(`Cantidad de ${nombre}`, { exact: true })
    .fill(String(cantidad));
}
test('ultimos 4 digitos, ficha, correccion, historial y pedido precargado editable', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const marca = Date.now();
  const tel = telefonoTemporal();
  const nombre = `Ficha Cliente ${marca}`;
  const admin = await api(request, 'POST', '/auth/login', {
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  const token = admin.token;
  const p = await api(
    request,
    'POST',
    '/catalogo',
    {
      nombre: `Gas Ficha ${marca}`,
      descripcion: 'Atención al cliente',
      peso: 11,
      categoria: 'GAS',
      precio: 15000,
      stock: 40,
    },
    token,
  );
  const body = {
    cliente: {
      nombre,
      telefono: tel,
      direccion: {
        calle: 'Principal Ficha',
        numero: '12A',
        comuna: 1,
        referencia: 'Porton azul',
      },
    },
    items: [{ id_producto: p.id_producto, cantidad: 1 }],
    metodo_cobro: 'EFECTIVO',
  };
  const pedido = await api(request, 'POST', '/pedidos/telefonico', body, token);
  await api(
    request,
    'POST',
    '/pedidos/telefonico',
    {
      ...body,
      cliente: {
        ...body.cliente,
        direccion: {
          ...body.cliente.direccion,
          calle: 'Entrega distinta',
          numero: '80',
        },
      },
    },
    token,
  );
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.TEST_ADMIN_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.TEST_ADMIN_PASSWORD);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/pedidos$/);
  await page
    .getByRole('navigation', { name: 'Administración', exact: true })
    .getByRole('link', { name: 'Clientes por teléfono', exact: true })
    .click();
  await page.getByLabel('Buscar cliente por teléfono').fill(tel.slice(-4));
  await page
    .getByRole('button', { name: `Ver ficha de ${nombre}`, exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/clientes/${pedido.cliente.id_cliente}$`),
  );
  await expect(
    page.getByRole('heading', { name: nombre, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: `Ver pedido #${pedido.id_venta}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('table', {
        name: 'Pedidos recientes del cliente',
        exact: true,
      })
      .getByRole('row'),
  ).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Editar cliente', exact: true })
    .click();
  await page.getByLabel('Nombre del cliente').fill(`Corregido ${marca}`);
  await page.getByLabel('Calle principal').fill('Nueva Ficha');
  await page.getByLabel('Número principal').fill('450');
  await page.getByLabel('Referencia principal').fill('Depto B');
  await page.getByLabel('Comuna principal').selectOption('2');
  await page
    .getByRole('button', { name: 'Guardar ficha', exact: true })
    .click();
  await expect(page.locator('.aviso-exito[role="status"]')).toContainText(
    'Ficha del cliente actualizada.',
  );
  await expect(
    page.getByRole('heading', { name: `Corregido ${marca}`, exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath('ficha-cliente.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', {
      name: 'Nuevo pedido para este cliente',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    `Corregido ${marca}`,
  );
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue(tel);
  await expect(page.getByLabel('Calle', { exact: true })).toHaveValue(
    'Nueva Ficha',
  );
  await expect(page.getByLabel('Número', { exact: true })).toHaveValue('450');
  await expect(page.getByLabel('Comuna', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Referencia (opcional)')).toHaveValue('Depto B');
  await page.getByLabel('Calle', { exact: true }).fill('Entrega Temporal');
  await page.getByLabel('Número', { exact: true }).fill('22');
  await elegirProducto(page, p.nombre, 2);
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  await page
    .getByRole('button', { name: 'Revisar pedido telefónico', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear pedido telefónico', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/pedidos\/[a-f0-9]{24}$/);
  const nuevo = await api(
    request,
    'GET',
    `/pedidos/${page.url().split('/').at(-1)}`,
    undefined,
    token,
  );
  expect(nuevo.cliente.id_cliente).toBe(pedido.cliente.id_cliente);
  expect(nuevo.direccion_entrega.calle).toBe('Entrega Temporal');
  const ficha = await api(
    request,
    'GET',
    `/clientes/${pedido.cliente.id_cliente}`,
    undefined,
    token,
  );
  expect(ficha.direccion_principal).toBe('Nueva Ficha 450');
  expect(ficha.cantidad_pedidos).toBe(3);
  const antiguo = await api(
    request,
    'GET',
    `/pedidos/${pedido._id}`,
    undefined,
    token,
  );
  expect(antiguo.cliente.nombre).toBe(nombre);
  expect(antiguo.direccion_entrega.calle).toBe('Principal Ficha');
  // Mismo buscador dentro del formulario; elegir cliente no pierde productos seleccionados.
  await page.goto('/admin/llamada');
  await elegirProducto(page, p.nombre, 1);
  await page.getByLabel('Buscar cliente por teléfono').fill(tel.slice(-4));
  await page
    .getByRole('button', {
      name: `Ver ficha de Corregido ${marca}`,
      exact: true,
    })
    .click();
  await page
    .getByRole('button', {
      name: 'Nuevo pedido para este cliente',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue(tel);
  await expect(
    page.getByLabel(`Cantidad de ${p.nombre}`, { exact: true }),
  ).toHaveValue('1');
  await expect(page.locator('.totales .total dd')).toHaveText('$15.000');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errores).toEqual([]);
});
