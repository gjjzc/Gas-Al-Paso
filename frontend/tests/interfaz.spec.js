import { test, expect } from '@playwright/test';
const producto = {
  id_producto: 2,
  nombre: 'Gas 11kg',
  categoria: 'GAS',
  descripcion: 'Balón de gas para tu hogar',
  peso: 11,
  precio: 15000,
  stock: 10,
  activo: true,
  destacado: true,
};
const cliente = {
  id_usuario: 901,
  id_cliente: 901,
  nombre: 'Cliente prueba',
  rol: 'CLIENTE',
  id_comuna: 1,
  direccion_principal: 'Calle Uno 123',
};
const vacio = { items: [], subtotal: 0, descuento: 0, total: 0 };
async function publico(page) {
  await page.route('**/api/catalogo?**', (r) =>
    r.fulfill({ json: [producto] }),
  );
  await page.route('**/api/comunas', (r) =>
    r.fulfill({ json: [{ id_comuna: 1, nombre: 'Santiago' }] }),
  );
}
test('catálogo público, diseño móvil sin desborde y ruta privada', async ({
  page,
}) => {
  await publico(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalogo');
  await expect(
    page.getByRole('heading', { name: 'Gas 11kg', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('$15.000', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: /Agregar al carrito/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/carrito');
  await expect(page).toHaveURL(/\/login$/);
});
test('error de catálogo recuperable y búsqueda vacía', async ({ page }) => {
  let fallar = true;
  await page.route('**/api/catalogo?**', (r) =>
    r.fulfill(
      fallar
        ? { status: 503, json: { mensaje: 'Catálogo no disponible.' } }
        : { json: [producto] },
    ),
  );
  await page.goto('/catalogo');
  await expect(page.getByRole('alert')).toContainText(
    'Catálogo no disponible.',
  );
  fallar = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'Gas 11kg' })).toBeVisible();
  await page.getByRole('searchbox').fill('sin coincidencias');
  await expect(
    page.getByText('No encontramos productos con estos filtros.'),
  ).toBeVisible();
});
test('login inválido muestra error y registro valida confirmación', async ({
  page,
}) => {
  await publico(page);
  await page.route('**/api/auth/login', (r) =>
    r.fulfill({
      status: 401,
      json: { mensaje: 'Email o contrasena incorrectos.' },
    }),
  );
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('cliente@demo.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('incorrectos');
  await page.goto('/registro');
  await page.getByLabel('Nombre completo').fill('Cliente Prueba');
  await page.getByLabel('Teléfono').fill('+56912345678');
  await page.getByLabel('Correo electrónico').fill('cliente@demo.test');
  await page.getByLabel('Comuna', { exact: true }).selectOption('1');
  await page.getByLabel('Dirección principal').fill('Calle Uno 123');
  await page.getByLabel('Contraseña', { exact: true }).fill('ClaveDemo2026!');
  await page.getByLabel('Repetir contraseña').fill('OtraClave2026!');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByRole('alert')).toContainText('no coinciden');
});
test('sesión vencida redirige y ADMIN no accede al carrito', async ({
  page,
}) => {
  await publico(page);
  await page.addInitScript(() =>
    sessionStorage.setItem('gas-al-paso.token', 'token-prueba'),
  );
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ status: 401, json: { mensaje: 'Token vencido.' } }),
  );
  await page.goto('/pedidos');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toContainText('Tu sesión terminó');
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { ...cliente, rol: 'ADMIN', id_cliente: null } }),
  );
  await page.goto('/carrito');
  await expect(
    page.getByRole('heading', { name: 'Esta sección es para clientes' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Administración' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation').getByRole('link', { name: /Carrito/ }),
  ).toHaveCount(0);
});
test('carrito vacío, error y recuperación', async ({ page }) => {
  await publico(page);
  await page.addInitScript(() =>
    sessionStorage.setItem('gas-al-paso.token', 'token-prueba'),
  );
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: cliente }));
  await page.route('**/api/carrito', (r) =>
    r.fulfill({
      status: 503,
      json: { mensaje: 'Carrito temporalmente no disponible.' },
    }),
  );
  await page.goto('/carrito');
  await expect(page.getByRole('alert')).toContainText('temporalmente');
  await page.unroute('**/api/carrito');
  await page.route('**/api/carrito', (r) => r.fulfill({ json: vacio }));
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tu carrito está esperando' }),
  ).toBeVisible();
});
test('stock insuficiente conserva carrito y permite corregir antes de volver a confirmar', async ({
  page,
}) => {
  await publico(page);
  const carrito = {
    items: [
      {
        id_producto: 2,
        nombre: 'Gas 11kg',
        cantidad: 2,
        precio_unitario: 15000,
      },
    ],
    subtotal: 30000,
    descuento: 3000,
    total: 27000,
    version: 'version-prueba',
  };
  await page.addInitScript(() =>
    sessionStorage.setItem('gas-al-paso.token', 'token-prueba'),
  );
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: cliente }));
  await page.route('**/api/carrito', (r) => r.fulfill({ json: carrito }));
  await page.route('**/api/pedidos', (r) =>
    r.fulfill({
      status: 409,
      json: {
        mensaje:
          'Stock insuficiente para Gas 11kg. Disponible: 1; solicitado: 2.',
      },
    }),
  );
  await page.goto('/confirmar');
  await page.getByLabel('Calle', { exact: true }).fill('Calle Uno');
  await page.getByLabel('Número', { exact: true }).fill('123');
  await page
    .getByRole('button', { name: 'Confirmar pedido', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Stock insuficiente');
  await expect(page.getByLabel('Calle', { exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('gas-al-paso.confirmacion.901'),
    ),
  ).toBeNull();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /Carrito/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Gas 11kg', exact: true }),
  ).toBeVisible();
});
test('carrito vencido impide confirmar y REPARTIDOR solo ve su navegación', async ({
  page,
}) => {
  await publico(page);
  await page.addInitScript(() =>
    sessionStorage.setItem('gas-al-paso.token', 'token-prueba'),
  );
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: cliente }));
  await page.route('**/api/carrito', (r) => r.fulfill({ json: vacio }));
  await page.goto('/confirmar');
  await expect(
    page.getByRole('heading', { name: 'Tu carrito está vacío' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirmar pedido' }),
  ).toHaveCount(0);
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { ...cliente, rol: 'REPARTIDOR', id_cliente: null } }),
  );
  await page.route('**/api/pedidos/asignados?**', (r) =>
    r.fulfill({ json: [] }),
  );
  await page.goto('/mi-espacio');
  await expect(
    page.getByRole('heading', { name: 'Pedidos asignados' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation').getByRole('link', { name: /Carrito/ }),
  ).toHaveCount(0);
  await page.goto('/pedidos');
  await expect(
    page.getByRole('heading', { name: 'Esta sección es para clientes' }),
  ).toBeVisible();
});
