import { claveTemporal } from './datos.js';
import { telefonoTemporal } from './datos.js';
import { test, expect } from '@playwright/test';
test.skip(!process.env.E2E_REAL, 'Activar E2E_REAL=1 para usar bases de integración.');
async function pedir(request, method, ruta, body, token, estado) {
  const r = await request.fetch(`/api${ruta}`, {
    method,
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (estado) expect(r.status(), await r.text()).toBe(estado);
  else expect(r.ok(), `${method} ${ruta}: ${await r.text()}`).toBeTruthy();
  return r.json();
}
async function preparar(request, sufijo) {
  const marca = `${Date.now()}-${sufijo}`;
  const admin = await pedir(request, 'POST', '/auth/login', {
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  const clave = claveTemporal('control-3');
  const rep = await pedir(
    request,
    'POST',
    '/usuarios',
    {
      nombre: `Rep jornada ${marca}`,
      email: `jornada-${marca}@operaciones.test`,
      password: clave,
      rol: 'REPARTIDOR',
      comunas: [1],
    },
    admin.token,
  );
  const sesion = await pedir(request, 'POST', '/auth/login', {
    email: rep.email,
    password: clave,
  });
  const p = await pedir(
    request,
    'POST',
    '/catalogo',
    {
      nombre: `Gas Jornada ${marca}`,
      descripcion: 'Balón de integración móvil',
      categoria: 'GAS',
      peso: 11,
      precio: 15000,
      stock: 20,
    },
    admin.token,
  );
  await pedir(
    request,
    'POST',
    '/cargas',
    {
      id_empleado: rep.id_empleado,
      items: [{ id_producto: p.id_producto, cantidad_cargada: 5 }],
    },
    admin.token,
  );
  return { admin, rep, sesion, p, clave, marca };
}
async function ingresar(page, datos) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(datos.rep.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(datos.clave);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/repartidor\/pedidos$/);
}
async function nav(page, nombre) {
  await page
    .getByRole('navigation', { name: 'Jornada del repartidor' })
    .getByRole('link', { name: nombre, exact: true })
    .click();
}
test('jornada completa móvil: entrega real, tarreo, ventas y cierre sin duplicados', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const d = await preparar(request, 'completa');
  await pedir(request, 'POST', '/auth/registro', {
    email: `cliente-${d.marca}@operaciones.test`,
    password: d.clave,
    nombre: 'Cliente Jornada',
    telefono: telefonoTemporal(),
    direccion_principal: 'Calle Jornada 123',
    id_comuna: 1,
  });
  const cliente = await pedir(request, 'POST', '/auth/login', {
    email: `cliente-${d.marca}@operaciones.test`,
    password: d.clave,
  });
  await pedir(
    request,
    'POST',
    '/carrito/items',
    { id_producto: d.p.id_producto, cantidad: 1 },
    cliente.token,
  );
  const pedido = await pedir(
    request,
    'POST',
    '/pedidos',
    {
      direccion_entrega: {
        calle: 'Calle Jornada',
        numero: '123',
        id_comuna: 1,
        referencia: 'Portón de integración',
      },
      metodo_cobro: 'EFECTIVO',
    },
    cliente.token,
  );
  await pedir(
    request,
    'PATCH',
    `/pedidos/${pedido._id}/asignar`,
    { id_empleado: d.rep.id_empleado },
    d.admin.token,
  );
  await ingresar(page, d);
  const tarjeta = page
    .getByRole('article')
    .filter({
      has: page.getByRole('heading', { name: 'Cliente Jornada', exact: true }),
    });
  await expect(
    tarjeta.getByText('Calle Jornada 123', { exact: true }),
  ).toBeVisible();
  await expect(tarjeta.getByText('Portón de integración')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('pedidos-movil.png'),
    fullPage: true,
  });
  await nav(page, 'Cierre');
  await expect(
    page.getByRole('heading', { name: 'No puedes cerrar todavía' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Revisar cierre de jornada' }),
  ).toBeDisabled();
  await nav(page, 'Pedidos');
  await tarjeta.getByRole('button', { name: 'Iniciar camino' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Volver', exact: true })
    .click();
  expect(
    (
      await pedir(
        request,
        'GET',
        `/pedidos/${pedido._id}`,
        undefined,
        d.sesion.token,
      )
    ).estado,
  ).toBe('ASIGNADO');
  await tarjeta.getByRole('button', { name: 'Iniciar camino' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar en camino' })
    .click();
  await expect(
    tarjeta.getByRole('button', { name: 'Entregar y cobrar' }),
  ).toBeVisible();
  await tarjeta.getByRole('button', { name: 'Entregar y cobrar' }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Confirmar entrega' }),
  ).toBeDisabled();
  await page.getByLabel('Método de pago real').selectOption('TRANSFERENCIA');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar entrega' })
    .click();
  await expect(tarjeta.getByText('Pago real: Transferencia')).toBeVisible();
  const entregado = await pedir(
    request,
    'GET',
    `/pedidos/${pedido._id}`,
    undefined,
    cliente.token,
  );
  expect(entregado.estado).toBe('ENTREGADO');
  expect(entregado.metodo_pago).toBe('TRANSFERENCIA');
  expect(entregado.historial_estados).toHaveLength(4);
  await nav(page, 'Venta calle');
  for (
    let i = 0;
    i < 80 &&
    !(await page
      .getByRole('heading', { name: d.p.nombre, exact: true })
      .count());
    i++
  ) {
    const respuesta = page.waitForResponse((r) =>
      r.url().includes('/api/catalogo?'),
    );
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await respuesta;
    await expect(page.getByText('Cargando productos…')).toHaveCount(0);
  }
  await page.getByLabel(`Cantidad de ${d.p.nombre}`, { exact: true }).fill('2');
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  const claves = [];
  let primera = true;
  await page.route('**/api/ventas/calle', async (ruta) => {
    claves.push(ruta.request().headers()['idempotency-key']);
    const r = await ruta.fetch();
    if (primera) {
      primera = false;
      expect(r.status()).toBe(201);
      await ruta.fulfill({
        status: 503,
        json: { mensaje: 'Respuesta de venta perdida durante la operación.' },
      });
    } else {
      expect(r.status()).toBe(200);
      await ruta.fulfill({ response: r });
    }
  });
  await page.getByRole('button', { name: 'Revisar y confirmar venta' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar venta cobrada' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Respuesta de venta perdida',
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Reintentar misma solicitud' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Cobro registrado por Efectivo',
  );
  expect(claves).toHaveLength(2);
  expect(claves[0]).toBe(claves[1]);
  expect(
    (await pedir(request, 'GET', `/catalogo/${d.p.id_producto}`)).stock,
  ).toBe(17);
  await nav(page, 'Ventas del día');
  await expect(
    page.locator('.indicadores-jornada').getByText('$42.000', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.indicadores-jornada').getByText('$27.000', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.indicadores-jornada').getByText('$15.000', { exact: true }),
  ).toBeVisible();
  await nav(page, 'Cierre');
  await expect(page.getByText('No puedes cerrar todavía')).toHaveCount(0);
  await page.getByLabel('Efectivo entregado').fill('27000');
  await page.getByLabel('Transferencia entregada').fill('15000');
  await page.getByLabel(`Devueltos de ${d.p.nombre}`).fill('2');
  await page
    .getByLabel('Observación (opcional)')
    .fill('Jornada completa desde celular');
  const cierres = [];
  let primerCierre = true;
  await page.route('**/api/cierre', async (ruta) => {
    if (ruta.request().method() !== 'POST') return ruta.continue();
    cierres.push(ruta.request().headers()['idempotency-key']);
    const r = await ruta.fetch();
    if (primerCierre) {
      primerCierre = false;
      expect(r.status()).toBe(201);
      await ruta.fulfill({
        status: 503,
        json: { mensaje: 'Respuesta de cierre perdida durante la operación.' },
      });
    } else {
      expect(r.status()).toBe(200);
      await ruta.fulfill({ response: r });
    }
  });
  await page.getByRole('button', { name: 'Revisar cierre de jornada' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar cierre', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Respuesta de cierre perdida',
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Reintentar misma solicitud' })
    .click();
  await expect(
    page.getByText('Jornada cuadrada', { exact: true }),
  ).toBeVisible();
  expect(cierres).toHaveLength(2);
  expect(cierres[0]).toBe(cierres[1]);
  const cierre = await pedir(
    request,
    'GET',
    '/cierre',
    undefined,
    d.sesion.token,
  );
  expect(cierre.estado).toBe('CUADRADO');
  expect(cierre.dinero.total.diferencia).toBe(0);
  expect(cierre.balones[0]).toMatchObject({
    cargado: 5,
    vendido: 3,
    devuelto: 2,
    diferencia: 0,
  });
  await page.reload();
  await expect(
    page.getByText('Jornada cuadrada', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('cierre-movil.png'),
    fullPage: true,
  });
  await nav(page, 'Venta calle');
  await expect(
    page.getByRole('button', { name: 'Revisar y confirmar venta' }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errores).toEqual([]);
  // El reporte propio no abre las consultas administrativas ni permite elegir otro empleado.
  await pedir(request, 'GET', '/cierre', undefined, undefined, 401);
  await pedir(request, 'GET', '/cierre', undefined, d.admin.token, 403);
  await pedir(request, 'GET', '/cierre', undefined, cliente.token, 403);
  await pedir(
    request,
    'GET',
    '/cierre?id_empleado=1',
    undefined,
    d.sesion.token,
    400,
  );
  await pedir(
    request,
    'GET',
    '/cierre?fecha=2026-02-30',
    undefined,
    d.sesion.token,
    400,
  );
  await pedir(request, 'GET', '/cuadratura', undefined, d.sesion.token, 403);
  await pedir(request, 'GET', '/cargas', undefined, d.sesion.token, 403);
  const otro = await pedir(
    request,
    'POST',
    '/usuarios',
    {
      nombre: 'Rep aislado',
      email: `otro-${d.marca}@operaciones.test`,
      password: d.clave,
      rol: 'REPARTIDOR',
      comunas: [1],
    },
    d.admin.token,
  );
  const otroLogin = await pedir(request, 'POST', '/auth/login', {
    email: otro.email,
    password: d.clave,
  });
  const privado = await pedir(
    request,
    'GET',
    '/cierre',
    undefined,
    otroLogin.token,
  );
  expect(privado.id_empleado).toBe(otro.id_empleado);
  expect(privado.dinero.total.esperado).toBe(0);
  expect(privado.balones).toEqual([]);
  await pedir(
    request,
    'GET',
    `/pedidos/${pedido._id}`,
    undefined,
    otroLogin.token,
    404,
  );
});
test('cierre móvil conserva y muestra faltantes reales de dinero y balones', async ({
  page,
  request,
}) => {
  const d = await preparar(request, 'descuadre');
  await pedir(
    request,
    'POST',
    '/ventas/calle',
    {
      items: [{ id_producto: d.p.id_producto, cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
    },
    d.sesion.token,
  );
  await ingresar(page, d);
  await nav(page, 'Cierre');
  await page.getByLabel('Efectivo entregado').fill('14000');
  await page.getByLabel('Transferencia entregada').fill('0');
  await page.getByLabel(`Devueltos de ${d.p.nombre}`).fill('3');
  await page.getByRole('button', { name: 'Revisar cierre de jornada' }).click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('heading', { name: 'El cierre tiene diferencias' }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cierre con diferencias' })
    .click();
  await expect(
    page.getByText('Cierre con descuadre', { exact: true }),
  ).toBeVisible();
  const r = await pedir(request, 'GET', '/cierre', undefined, d.sesion.token);
  expect(r.dinero.efectivo.diferencia).toBe(-1000);
  expect(r.balones[0].diferencia).toBe(-1);
  expect(r.estado).toBe('DESCUADRE');
  await expect(
    page.getByText('Descuadre de balones', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
