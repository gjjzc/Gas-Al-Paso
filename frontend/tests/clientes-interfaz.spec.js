import { test, expect } from '@playwright/test';
const admin = {
  id_usuario: 980,
  id_empleado: 980,
  nombre: 'Admin Busqueda',
  rol: 'ADMIN',
};
function cliente(id, nombre, telefono) {
  return {
    id_cliente: id,
    nombre,
    telefono,
    direccion_principal: 'Calle Uno 12',
    id_comuna: 1,
    comuna: 'Santiago',
    cantidad_pedidos: 2,
    fecha_ultimo_pedido: '2026-11-06T10:00:00Z',
  };
}
async function preparar(page) {
  await page.addInitScript(() =>
    sessionStorage.setItem('gas-al-paso.token', 'token-admin-clientes'),
  );
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: admin }));
  await page.route('**/api/comunas', (r) =>
    r.fulfill({ json: [{ id_comuna: 1, nombre: 'Santiago' }] }),
  );
  await page.route('**/api/catalogo?**', (r) => r.fulfill({ json: [] }));
}
test('espera 300ms y no consulta con menos de cuatro digitos', async ({
  page,
}) => {
  await preparar(page);
  await page.clock.install({time:new Date('2026-11-06T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-06T00:00:01Z'));
  const consultas = [];
  await page.route('**/api/clientes?**', (r) => {
    consultas.push(r.request().url());
    return r.fulfill({ json: [cliente(1, 'Ana Busqueda', '912341234')] });
  });
  await page.goto('/admin/clientes');
  const input = page.getByLabel('Buscar cliente por teléfono');
  await input.fill('123');
  await page.clock.runFor(500);
  expect(consultas).toHaveLength(0);
  await input.fill('1234');
  await expect(page.getByText('Buscando clientes…',{exact:true})).toBeVisible();
  await page.clock.runFor(299);
  expect(consultas).toHaveLength(0);
  await page.clock.runFor(1);
  await expect(page.getByText('Ana Busqueda', { exact: true })).toBeVisible();
  expect(consultas).toHaveLength(1);
  expect(consultas[0]).toContain('telefono=1234');
});
test('una respuesta vieja no sustituye los resultados de una nueva busqueda', async ({
  page,
}) => {
  await preparar(page);
  let liberar;
  await page.route('**/api/clientes?**', async (r) => {
    if (r.request().url().endsWith('1234')) {
      await new Promise((resolve) => {
        liberar = async () => {
          await r
            .fulfill({ json: [cliente(1, 'Cliente Viejo', '912341234')] })
            .catch(() => {});
          resolve();
        };
      });
    } else
      await r.fulfill({ json: [cliente(2, 'Cliente Nuevo', '956785678')] });
  });
  await page.goto('/admin/clientes');
  await page.getByLabel('Buscar cliente por teléfono').fill('1234');
  await expect.poll(() => Boolean(liberar)).toBe(true);
  await page.getByLabel('Buscar cliente por teléfono').fill('5678');
  await expect(page.getByText('Cliente Nuevo', { exact: true })).toBeVisible();
  await liberar();
  await expect(page.getByText('Cliente Viejo', { exact: true })).toHaveCount(0);
  await page.getByLabel('Buscar cliente por teléfono').fill('12');
  await expect(page.getByText('Cliente Nuevo', { exact: true })).toHaveCount(0);
});
test('error no ofrece crear; sin resultados precarga telefono sin inventar los digitos restantes', async ({
  page,
}) => {
  await preparar(page);
  let falla = true;
  await page.route('**/api/clientes?**', (r) =>
    r.fulfill(
      falla
        ? { status: 503, json: { mensaje: 'No se pudo consultar Mongo.' } }
        : { json: [] },
    ),
  );
  await page.goto('/admin/clientes');
  await page.getByLabel('Buscar cliente por teléfono').fill('9999');
  await expect(page.getByRole('alert')).toContainText('No se pudo consultar');
  await expect(
    page.getByRole('button', { name: 'Crear cliente y pedido' }),
  ).toHaveCount(0);
  falla = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(
    page.getByText('Sin resultados para ese teléfono.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Crear cliente y pedido', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/llamada$/);
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue(
    '9999',
  );
  await page
    .getByRole('button', { name: 'Revisar pedido telefónico', exact: true })
    .click();
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});
test('CLIENTE no puede abrir fichas de administracion', async ({ page }) => {
  await preparar(page);
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        id_usuario: 981,
        id_cliente: 981,
        nombre: 'Valentina Soto',
        rol: 'CLIENTE',
      },
    }),
  );
  await page.route('**/api/carrito', (r) =>
    r.fulfill({ json: { items: [], subtotal: 0, descuento: 0, total: 0 } }),
  );
  await page.goto('/admin/clientes/1');
  await expect(
    page.getByRole('heading', {
      name: 'Esta sección es para administradores',
      exact: true,
    }),
  ).toBeVisible();
});
