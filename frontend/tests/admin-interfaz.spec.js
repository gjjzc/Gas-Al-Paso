import { test, expect } from '@playwright/test';
const admin = {
  id_usuario: 950,
  id_empleado: 950,
  nombre: 'Admin interfaz',
  rol: 'ADMIN',
};
async function iniciar(page, usuario = admin) {
  await page.addInitScript(() =>
    sessionStorage.setItem('gas-al-paso.token', 'token-control-admin'),
  );
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: usuario }));
  await page.route('**/api/comunas', (r) =>
    r.fulfill({ json: [{ id_comuna: 1, nombre: 'Santiago' }] }),
  );
}
test('tablero recupera un error y aplica filtros de estado y comuna', async ({
  page,
}) => {
  await iniciar(page);
  let falla = true;
  let query = '';
  await page.route('**/api/pedidos?**', (r) => {
    query = r.request().url();
    return r.fulfill(
      falla
        ? {
            status: 503,
            json: { mensaje: 'Pedidos temporalmente no disponibles.' },
          }
        : { json: [] },
    );
  });
  await page.goto('/admin/pedidos');
  await expect(page.getByRole('alert')).toContainText('temporalmente');
  falla = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Recibido', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Estado del pedido').selectOption('EN_CAMINO');
  await page.getByLabel('Comuna del pedido').selectOption('1');
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'En camino', exact: true }),
  ).toBeVisible();
  expect(query).toContain('estado=EN_CAMINO');
  expect(query).toContain('comuna=1');
  await expect(
    page.getByRole('heading', { name: 'Recibido', exact: true }),
  ).toHaveCount(0);
});
test('CLIENTE no accede a administración y una ruta anónima exige login', async ({
  page,
}) => {
  await page.goto('/admin/productos');
  await expect(page).toHaveURL(/\/login$/);
  await iniciar(page, {
    id_usuario: 951,
    id_cliente: 951,
    nombre: 'Cliente interfaz',
    rol: 'CLIENTE',
  });
  await page.route('**/api/carrito', (r) =>
    r.fulfill({ json: { items: [], subtotal: 0, descuento: 0, total: 0 } }),
  );
  await page.goto('/admin/usuarios');
  await expect(
    page.getByRole('heading', {
      name: 'Esta sección es para administradores',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Administración', exact: true }),
  ).toHaveCount(0);
});
test('último administrador protegido: muestra el error del servidor sin fingir guardado', async ({
  page,
}) => {
  await iniciar(page);
  await page.route('**/api/usuarios?**', (r) =>
    r.fulfill({ json: [{ ...admin, email: 'admin@operaciones.test', activo: true }] }),
  );
  await page.route('**/api/usuarios/950', (r) =>
    r.fulfill({
      status: 409,
      json: {
        mensaje:
          'No puedes desactivar ni cambiar el rol del ultimo administrador activo.',
      },
    }),
  );
  await page.goto('/admin/usuarios');
  await page
    .getByRole('button', { name: 'Editar admin@operaciones.test', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Usuario activo', exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: 'Guardar usuario', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Es tu propia cuenta');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cambio de acceso', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('ultimo administrador');
  await expect(
    page.getByRole('heading', { name: 'Editar usuario', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('cuadratura resalta diferencias por método aunque el total de dinero sea cero', async ({
  page,
}) => {
  await iniciar(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/repartidores', (r) => r.fulfill({ json: [] }));
  const metodo = (esperado, entregado) => ({
    esperado,
    entregado,
    diferencia: entregado - esperado,
    descuadre: entregado !== esperado,
  });
  await page.route('**/api/cuadratura?**', (r) =>
    r.fulfill({
      json: {
        fecha: '2026-11-06',
        resumen: { abiertos: 0, cerrados: 1, con_descuadre: 1 },
        repartidores: [
          {
            id_empleado: 970,
            nombre: 'Rep descuadre',
            activo: true,
            estado: 'DESCUADRE',
            descuadre: true,
            cierre: {
              id_cierre: 1,
              observacion: 'Método cambiado',
              desactualizado: false,
            },
            ventas: {
              cantidad: 2,
              subtotal: 20000,
              descuento: 0,
              total: 20000,
            },
            dinero: {
              efectivo: metodo(15000, 14000),
              transferencia: metodo(5000, 6000),
              total: metodo(20000, 20000),
              descuadre: true,
            },
            balones: [
              {
                id_producto: 2,
                nombre: 'Gas Familiar',
                cargado: 3,
                vendido: 1,
                devuelto: 1,
                diferencia: -1,
                descuadre: true,
              },
            ],
            productos_vendidos: [
              {
                id_producto: 2,
                nombre: 'Gas Familiar',
                cantidad: 1,
                subtotal: 20000,
                descuento: 0,
                total: 20000,
              },
            ],
            pedidos_sin_resolver: [],
          },
        ],
      },
    }),
  );
  await page.goto('/admin/cuadratura');
  await expect(page.getByText('Descuadre', { exact: true })).toBeVisible();
  await expect(page.locator('.trabajador-descuadre')).toHaveCount(1);
  await page
    .getByText('Ver cuadratura de Rep descuadre', { exact: true })
    .click();
  await expect(page.locator('.fila-descuadre')).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
