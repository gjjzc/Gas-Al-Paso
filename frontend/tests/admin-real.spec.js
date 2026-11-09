import { claveTemporal } from './datos.js';
import { telefonoTemporal } from './datos.js';
import { test, expect } from '@playwright/test';
test.skip(!process.env.E2E_REAL, 'Activar E2E_REAL=1 para las bases de integración.');
async function api(request, method, ruta, body, token, estado) {
  const r = await request.fetch(`/api${ruta}`, {
    method,
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (estado) expect(r.status(), await r.text()).toBe(estado);
  else expect(r.ok(), `${ruta}: ${await r.text()}`).toBeTruthy();
  return r.json();
}
async function entrar(
  page,
  email = process.env.TEST_ADMIN_EMAIL,
  password = process.env.TEST_ADMIN_PASSWORD,
) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/(admin|repartidor)\/pedidos$/);
}
async function nav(page, nombre) {
  await page
    .getByRole('navigation', { name: 'Administración', exact: true })
    .getByRole('link', { name: nombre, exact: true })
    .click();
}
async function usuarioUI(page, { nombre, email, rol, clave }) {
  await nav(page, 'Usuarios');
  await page
    .getByRole('button', { name: 'Crear usuario', exact: true })
    .click();
  await page.getByLabel('Nombre del usuario').fill(nombre);
  await page.getByLabel('Correo del usuario').fill(email);
  await page.getByLabel('Rol del usuario').selectOption(rol);
  await page.getByLabel('Contraseña inicial').fill(clave);
  if (rol === 'CLIENTE') {
    await page.getByLabel('Teléfono del cliente').fill(telefonoTemporal());
    await page.getByLabel('Comuna del cliente').selectOption('1');
    await page.getByLabel('Dirección del cliente').fill('Calle Admin 123');
  }
  await page
    .getByRole('button', { name: 'Guardar usuario', exact: true })
    .click();
  await expect(page.locator('.aviso-exito[role="status"]')).toContainText(
    'Usuario creado.',
  );
  await expect(
    page.getByRole('heading', { name: 'Nuevo usuario', exact: true }),
  ).toHaveCount(0);
}
async function productoUI(page, { nombre, precio, peso, categoria }) {
  await nav(page, 'Productos');
  await page
    .getByRole('button', { name: 'Crear producto', exact: true })
    .click();
  await page.getByLabel('Nombre del producto').fill(nombre);
  await page.getByLabel('Categoría', { exact: true }).selectOption(categoria);
  await page.getByLabel('Peso en kg').fill(String(peso));
  await page.getByLabel('Precio en CLP').fill(String(precio));
  await page.getByLabel('Stock de empresa').fill('20');
  await page
    .getByLabel('Descripción del producto')
    .fill('Producto de integración administrativa');
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click();
  await expect(page.locator('.aviso-exito[role="status"]')).toContainText(
    'Producto creado.',
  );
}
async function buscarProducto(page, nombre) {
  await page
    .getByLabel('Buscar producto por nombre o descripción')
    .fill(nombre);
  await page
    .getByRole('button', { name: 'Buscar producto', exact: true })
    .click();
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByText(nombre, { exact: true }) }),
  ).toBeVisible();
  return page
    .getByRole('row')
    .filter({ has: page.getByText(nombre, { exact: true }) });
}
async function seleccionarItem(page, nombre, cantidad) {
  await page.getByLabel('Buscar productos', { exact: true }).fill(nombre);
  await page
    .getByRole('button', { name: 'Buscar productos', exact: true })
    .click();
  await page
    .getByLabel(`Cantidad de ${nombre}`, { exact: true })
    .fill(String(cantidad));
}
test('ADMIN recorre el día: usuarios, catálogo, comunas, carga, llamada, asignación y cuadratura', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const marca = Date.now();
  const clave = claveTemporal('jornada-admin');
  const repNombre = `Rep Admin ${marca}`;
  const clienteNombre = `Cliente Admin ${marca}`;
  const gasNombre = `Gas Admin ${marca}`;
  const accNombre = `Regulador Admin ${marca}`;
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await entrar(page);
  const token = await page.evaluate(() =>
    sessionStorage.getItem('gas-al-paso.token'),
  );
  await api(request, 'GET', '/usuarios?rol=INVALIDO', undefined, token, 400);
  await api(request, 'GET', '/usuarios?activo=1', undefined, token, 400);
  const literal = await api(
    request,
    'GET',
    `/usuarios?buscar=${encodeURIComponent("' OR 1=1 --")}`,
    undefined,
    token,
  );
  expect(literal).toEqual([]);

  await productoUI(page, {
    nombre: gasNombre,
    precio: 15000,
    peso: 11,
    categoria: 'GAS',
  });
  let fila = await buscarProducto(page, gasNombre);
  await fila
    .getByRole('button', { name: `Editar ${gasNombre}`, exact: true })
    .click();
  await page.getByLabel('Precio en CLP').fill('16000');
  await page.getByLabel('Stock de empresa').fill('22');
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click();
  await expect(page.locator('.aviso-exito[role="status"]')).toContainText(
    'Producto actualizado.',
  );
  fila = await buscarProducto(page, gasNombre);
  await fila
    .getByRole('button', { name: `Editar ${gasNombre}`, exact: true })
    .click();
  await page.getByLabel('Precio en CLP').fill('15000');
  await page.getByLabel('Stock de empresa').fill('20');
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Editar producto', exact: true }),
  ).toHaveCount(0);
  const gas = (
    await api(
      request,
      'GET',
      `/catalogo?buscar=${encodeURIComponent(gasNombre)}`,
    )
  )[0];
  expect(gas.precio).toBe(15000);
  expect(gas.stock).toBe(20);
  await productoUI(page, {
    nombre: accNombre,
    precio: 4000,
    peso: 0.2,
    categoria: 'ACCESORIO',
  });
  const accesorio = (
    await api(
      request,
      'GET',
      `/catalogo?buscar=${encodeURIComponent(accNombre)}`,
    )
  )[0];
  await usuarioUI(page, {
    nombre: repNombre,
    email: `rep-admin-${marca}@operaciones.test`,
    rol: 'REPARTIDOR',
    clave,
  });
  await usuarioUI(page, {
    nombre: clienteNombre,
    email: `cliente-admin-${marca}@operaciones.test`,
    rol: 'CLIENTE',
    clave,
  });
  const rep = (
    await api(
      request,
      'GET',
      `/usuarios?rol=REPARTIDOR&buscar=rep-admin-${marca}`,
      undefined,
      token,
    )
  )[0];
  const cliente = (
    await api(
      request,
      'GET',
      `/usuarios?rol=CLIENTE&buscar=cliente-admin-${marca}`,
      undefined,
      token,
    )
  )[0];
  expect(rep.id_empleado).toBeTruthy();
  expect(cliente.id_cliente).toBeTruthy();
  await nav(page, 'Comunas de reparto');
  await page
    .getByLabel('Repartidor de la cobertura')
    .selectOption(String(rep.id_empleado));
  await page.getByRole('checkbox', { name: 'Santiago', exact: true }).check();
  await page
    .getByRole('button', { name: 'Guardar comunas', exact: true })
    .click();
  await expect(page.locator('.aviso-exito[role="status"]')).toContainText(
    'Cobertura guardada.',
  );
  await nav(page, 'Cargas diarias');
  await page
    .getByLabel('Repartidor de la carga')
    .selectOption(String(rep.id_empleado));
  await seleccionarItem(page, gasNombre, 3);
  await page
    .getByRole('button', { name: 'Revisar carga', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sumar carga', exact: true })
    .click();
  await expect(page.locator('.aviso-exito[role="status"]')).toContainText(
    'Se sumaron',
  );
  await page
    .getByRole('button', { name: 'Preparar otra carga', exact: true })
    .click();
  await seleccionarItem(page, gasNombre, 2);
  await page
    .getByRole('button', { name: 'Revisar carga', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sumar carga', exact: true })
    .click();
  await expect(
    page.getByText(`${gasNombre}: +2 · Acumulado: 5`, { exact: true }),
  ).toBeVisible();
  expect(
    (await api(request, 'GET', `/catalogo/${gas.id_producto}`)).stock,
  ).toBe(20);
  await nav(page, 'Pedido por llamada');
  await page.getByLabel('Nombre', { exact: true }).fill(clienteNombre);
  await page.getByLabel('Teléfono', { exact: true }).fill(cliente.telefono);
  await seleccionarItem(page, gasNombre, 2);
  await page.getByLabel('Calle', { exact: true }).fill('Calle Admin');
  await page.getByLabel('Número', { exact: true }).fill('123');
  await page.getByLabel('Comuna', { exact: true }).selectOption('1');
  await page.getByLabel('Referencia (opcional)').fill('Portón administrativo');
  await expect(page.locator('.totales .total dd')).toHaveText('$27.000');
  await page
    .getByRole('button', { name: 'Revisar pedido telefónico', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear pedido telefónico', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/pedidos\/[a-f0-9]{24}$/);
  const id = page.url().split('/').at(-1);
  const pedido = await api(request, 'GET', `/pedidos/${id}`, undefined, token);
  expect(pedido.canal).toBe('LLAMADA');
  expect(pedido.total).toBe(27000);
  await page
    .getByRole('button', { name: 'Asignar repartidor', exact: true })
    .click();
  await expect(page.getByLabel('Repartidor para el pedido')).toBeVisible();
  const cubiertos = await page
    .getByLabel('Repartidor para el pedido')
    .locator('optgroup')
    .first()
    .getAttribute('label');
  expect(cubiertos).toBe('Cubren la comuna');
  await expect(
    page
      .getByLabel('Repartidor para el pedido')
      .locator(
        `optgroup[label="Cubren la comuna"] option[value="${rep.id_empleado}"]`,
      ),
  ).toHaveCount(1);
  await page
    .getByLabel('Repartidor para el pedido')
    .selectOption(String(rep.id_empleado));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar asignación', exact: true })
    .click();
  await expect(page.getByText(repNombre, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Marcar en camino', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar en camino', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Entregar y cobrar', exact: true })
    .click();
  await page.getByLabel('Método de pago real').selectOption('TRANSFERENCIA');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar entrega', exact: true })
    .click();
  await expect(
    page.getByText('Pago real: Transferencia', { exact: true }),
  ).toBeVisible();
  await nav(page, 'Pedidos');
  await page.getByLabel('Estado del pedido').selectOption('ENTREGADO');
  await page.getByLabel('Comuna del pedido').selectOption('1');
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click();
  await expect(
    page.getByRole('article').filter({
      has: page.getByRole('heading', { name: clienteNombre, exact: true }),
    }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('tablero-admin.png'),
    fullPage: true,
  });
  // El repartidor completa su tarreo y declara el cierre desde su propio navegador móvil.
  const contexto = await browser.newContext({
    baseURL: new URL('/', page.url()).href,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const movil = await contexto.newPage();
  await entrar(movil, rep.email, clave);
  await movil.goto(new URL('/repartidor/tarreo', page.url()).href);
  for (const [nombre, cantidad] of [
    [gasNombre, 1],
    [accNombre, 1],
  ]) {
    for (
      let i = 0;
      i < 100 &&
      !(await movil
        .getByLabel(`Cantidad de ${nombre}`, { exact: true })
        .count());
      i++
    ) {
      const respuesta = movil.waitForResponse((r) =>
        r.url().includes('/api/catalogo?'),
      );
      await movil
        .getByRole('button', { name: 'Siguiente', exact: true })
        .click();
      await respuesta;
      await expect(movil.getByText('Cargando productos…')).toHaveCount(0);
    }
    await movil
      .getByLabel(`Cantidad de ${nombre}`, { exact: true })
      .fill(String(cantidad));
  }
  await expect(movil.locator('.totales .total dd')).toHaveText('$19.000');
  await movil
    .getByRole('button', { name: 'Revisar y confirmar venta', exact: true })
    .click();
  await movil
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar venta cobrada', exact: true })
    .click();
  await expect(movil.getByRole('status')).toContainText('Cobro registrado');
  await movil
    .getByRole('navigation', { name: 'Jornada del repartidor' })
    .getByRole('link', { name: 'Cierre', exact: true })
    .click();
  await movil.getByLabel('Efectivo entregado').fill('19000');
  await movil.getByLabel('Transferencia entregada').fill('27000');
  await movil
    .getByLabel(`Devueltos de ${gasNombre}`, { exact: true })
    .fill('2');
  await movil
    .getByRole('button', { name: 'Revisar cierre de jornada', exact: true })
    .click();
  await movil
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar cierre', exact: true })
    .click();
  await expect(
    movil.getByText('Jornada cuadrada', { exact: true }),
  ).toBeVisible();
  await contexto.close();
  await nav(page, 'Cuadratura');
  await page
    .getByLabel('Trabajador de cuadratura')
    .selectOption(String(rep.id_empleado));
  await page
    .getByRole('button', { name: 'Consultar cuadratura', exact: true })
    .click();
  const trabajador = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: repNombre, exact: true }),
  });
  await expect(trabajador.getByText('Cuadrado', { exact: true })).toBeVisible();
  await expect(
    trabajador
      .locator('.resumen-cuadratura')
      .getByText('$46.000', { exact: true }),
  ).toBeVisible();
  await trabajador
    .getByText(`Ver cuadratura de ${repNombre}`, { exact: true })
    .click();
  const vendidos = trabajador.getByRole('table', {
    name: 'Todos los productos cobrados, incluidos accesorios',
    exact: true,
  });
  await expect(
    vendidos.getByRole('row').filter({ hasText: gasNombre }),
  ).toContainText('3');
  await expect(
    vendidos.getByRole('row').filter({ hasText: accNombre }),
  ).toContainText('1');
  await page.screenshot({
    path: test.info().outputPath('cuadratura-admin.png'),
    fullPage: true,
  });
  const q = await api(
    request,
    'GET',
    `/cuadratura?id_empleado=${rep.id_empleado}`,
    undefined,
    token,
  );
  expect(q.repartidores[0].dinero.total.diferencia).toBe(0);
  expect(q.repartidores[0].ventas).toMatchObject({
    cantidad: 2,
    subtotal: 49000,
    descuento: 3000,
    total: 46000,
  });
  expect(
    q.repartidores[0].productos_vendidos.map((x) => [
      x.id_producto,
      x.cantidad,
    ]),
  ).toEqual([
    [gas.id_producto, 3],
    [accesorio.id_producto, 1],
  ]);
  await nav(page, 'Auditoría');
  await page.getByLabel('Tipo de evento').fill('CARGA_DIARIA');
  await page
    .getByLabel('ID de empleado (opcional)')
    .fill(String(rep.id_empleado));
  await page
    .getByRole('button', { name: 'Filtrar auditoría', exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(2);
  const precios = await api(
    request,
    'GET',
    '/auditoria?tipo=CAMBIO_PRECIO',
    undefined,
    token,
  );
  expect(
    precios.some(
      (e) =>
        e.detalle.id_producto === gas.id_producto &&
        e.detalle.despues === 16000,
    ),
  ).toBe(true);
  await nav(page, 'Productos');
  fila = await buscarProducto(page, accNombre);
  await fila
    .getByRole('button', { name: `Eliminar ${accNombre}`, exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Desactivar producto', exact: true })
    .click();
  await expect(fila.getByText('Inactivo', { exact: true })).toBeVisible();
  await api(
    request,
    'GET',
    `/catalogo/${accesorio.id_producto}`,
    undefined,
    undefined,
    404,
  );
  // Gestionar acceso conserva la historia del trabajador cerrado.
  await nav(page, 'Usuarios');
  await page.getByLabel('Buscar usuario por nombre o correo').fill(rep.email);
  await page
    .getByRole('button', { name: 'Buscar usuarios', exact: true })
    .click();
  const filaRep = page
    .getByRole('row')
    .filter({ has: page.getByText(rep.email, { exact: true }) });
  await filaRep
    .getByRole('button', { name: `Editar ${rep.email}`, exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Usuario activo', exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: 'Guardar usuario', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cambio de acceso', exact: true })
    .click();
  await expect(filaRep.getByText('Inactivo', { exact: true })).toBeVisible();
  const historico = await api(
    request,
    'GET',
    `/cuadratura?id_empleado=${rep.id_empleado}`,
    undefined,
    token,
  );
  expect(historico.repartidores[0].estado).toBe('CUADRADO');
  expect(historico.repartidores[0].activo).toBe(false);
  expect(errores).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('ADMIN cancela y elimina un pedido conservando auditoría y reponiendo stock', async ({
  page,
  request,
}) => {
  await entrar(page);
  const token = await page.evaluate(() =>
    sessionStorage.getItem('gas-al-paso.token'),
  );
  const p = await api(
    request,
    'POST',
    '/catalogo',
    {
      nombre: `Cancel admin ${Date.now()}`,
      descripcion: 'Pedido cancelado',
      categoria: 'GAS',
      peso: 5,
      precio: 1000,
      stock: 5,
    },
    token,
  );
  const pedido = await api(
    request,
    'POST',
    '/pedidos/telefonico',
    {
      cliente: { nombre: 'Camila Herrera', telefono: telefonoTemporal(), direccion: { calle: 'Los Aromos', numero: '10', id_comuna: 1 } },
      metodo_cobro: 'EFECTIVO',
      items: [{ id_producto: p.id_producto, cantidad: 1 }],
    },
    token,
  );
  await page.goto(`/admin/pedidos/${pedido._id}`);
  await page
    .getByRole('button', { name: 'Cancelar pedido', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar cancelación', exact: true })
    .click();
  await expect(
    page.getByText('Cancelado', { exact: true }).first(),
  ).toBeVisible();
  expect((await api(request, 'GET', `/catalogo/${p.id_producto}`)).stock).toBe(
    5,
  );
  await page
    .getByRole('button', { name: 'Eliminar pedido cancelado', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Eliminar pedido', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/pedidos$/);
  await api(request, 'GET', `/pedidos/${pedido._id}`, undefined, token, 404);
  const ventas = await api(
    request,
    'GET',
    '/ventas/dia?estado_pago=ANULADA&limite=100',
    undefined,
    token,
  );
  expect(
    ventas.ventas.some(
      (v) => v.id_venta === pedido.id_venta && v.estado_pago === 'ANULADA',
    ),
  ).toBe(false);
  const eventos = await api(request, 'GET', '/auditoria?tipo=PEDIDO_ELIMINADO&limite=100', undefined, token);
  const evento = eventos.find(e => e.detalle.id_venta === pedido.id_venta);
  expect(evento.detalle.estado).toBe('CANCELADO');
  expect(evento.detalle.items[0].cantidad).toBe(1);
});
