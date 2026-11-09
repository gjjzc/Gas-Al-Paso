import { randomInt } from 'node:crypto';
// Suite funcional: ejecutar en el contenedor API con datos demo de desarrollo.
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { oraclePool, mongoClient, mongoDb } from './src/config/databases.js';

const base = 'http://127.0.0.1:4000/api';
const sufijo = Date.now();
let comprobaciones = 0;
async function pedir(metodo, ruta, datos, token, estado = 200) {
  const r = await fetch(base + ruta, { method: metodo,
    headers: { ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: datos === undefined ? undefined : JSON.stringify(datos), signal: AbortSignal.timeout(25000) });
  const cuerpo = await r.json();
  assert.equal(r.status, estado, `${metodo} ${ruta}: ${JSON.stringify(cuerpo)}`);
  comprobaciones += 1;
  return cuerpo;
}
function comprobar(valor, mensaje) { assert.ok(valor, mensaje); comprobaciones += 1; }
async function login(email) { return pedir('POST', '/auth/login', { email, password: 'GasPasoDemo2026!' }); }
try {
  const salud = await pedir('GET', '/health');
  comprobar(salud.oracle === 'OK' && salud.mongo === 'OK', 'Bases conectadas');
  const admin = await login('admin@demo.gasalpaso.test');
  const cliente = await login('ana@demo.gasalpaso.test');
  const repartidor = await login('camila@demo.gasalpaso.test');
  for (const [sesion, rol] of [[admin, 'ADMIN'], [cliente, 'CLIENTE'], [repartidor, 'REPARTIDOR']]) {
    const me = await pedir('GET', '/auth/me', undefined, sesion.token);
    comprobar(me.rol === rol && !('password_hash' in me) && !('token_version' in me), `Sesion ${rol}`);
  }
  await pedir('GET', '/auth/me', undefined, undefined, 401);
  await pedir('GET', '/auth/me', undefined, 'token.invalido', 401);
  const opcionesJwt = { issuer: 'gas-al-paso', audience: 'gas-al-paso-api', subject: String(admin.usuario.id_usuario) };
  const vencido = jwt.sign({ rol: 'ADMIN', version: 0 }, process.env.JWT_SECRET, { ...opcionesJwt, algorithm: 'HS256', expiresIn: -1 });
  await pedir('GET', '/auth/me', undefined, vencido, 401);
  const algoritmoIncorrecto = jwt.sign({ rol: 'ADMIN', version: 0 }, process.env.JWT_SECRET, { ...opcionesJwt, algorithm: 'HS384' });
  await pedir('GET', '/auth/me', undefined, algoritmoIncorrecto, 401);
  const rolIncorrecto = jwt.sign({ rol: 'CLIENTE', version: 0 }, process.env.JWT_SECRET, { ...opcionesJwt, algorithm: 'HS256' });
  await pedir('GET', '/auth/me', undefined, rolIncorrecto, 401);
  await pedir('POST', '/auth/login', { email: 'admin@demo.gasalpaso.test', password: 'incorrecta' }, undefined, 401);
  await pedir('POST', '/auth/login', { email: "a'@ejemplo.test", password: 'incorrecta' }, undefined, 401);
  await pedir('POST', '/catalogo', {}, cliente.token, 403);
  await pedir('POST', '/catalogo', {}, repartidor.token, 403);
  await pedir('GET', '/usuarios', undefined, cliente.token, 403);
  await pedir('GET', '/catalogo?incluir_inactivos=true', undefined, undefined, 401);
  await pedir('GET', '/catalogo?incluir_inactivos=true', undefined, cliente.token, 403);
  await pedir('PATCH', `/usuarios/${admin.usuario.id_usuario}`, { activo: false }, admin.token, 409);

  const catalogo = await pedir('GET', '/catalogo');
  comprobar(catalogo.length >= 6 && catalogo.every(p => Number.isFinite(p.precio) && Number.isInteger(p.stock)), 'Catalogo une las bases');
  await pedir('GET', '/catalogo/1');
  await pedir('GET', '/catalogo/1OR1=1', undefined, undefined, 400);
  await pedir('GET', '/catalogo/999999999', undefined, undefined, 404);
  const comunas = await pedir('GET', '/comunas');
  comprobar(comunas.length === 8, 'Ocho comunas');
  await pedir('POST', '/catalogo', { nombre: 'Invalido', stock: -1 }, admin.token, 400);
  const producto = await pedir('POST', '/catalogo', {
    nombre: `Gas prueba ${sufijo}`, descripcion: 'Producto de prueba automatizada', categoria: 'GAS',
    peso: 5, precio: 9900, stock: 12, atributos: { prueba: true },
  }, admin.token, 201);
  comprobar(producto.sincronizacion === 'OK', 'Alta sincronizada');
  const id = producto.id_producto;
  const editado = await pedir('PUT', `/catalogo/${id}`, { nombre: `Editado ${sufijo}`, precio: 10500, stock: 8, destacado: true }, admin.token);
  comprobar(editado.precio === 10500 && editado.stock === 8 && editado.destacado, 'Edicion completa');
  const lectura = await pedir('GET', `/catalogo/${id}`);
  comprobar(lectura.nombre === `Editado ${sufijo}` && lectura.precio === 10500, 'Lectura tras edicion');
  await pedir('PATCH', `/productos/${id}`, { precio: 12000, stock: 4 }, admin.token);
  await pedir('PATCH', `/productos/${id}`, { precio: 12000, stock: 4 }, admin.token);
  await pedir('PATCH', `/productos/${id}`, { stock: 1.5 }, admin.token, 400);
  await pedir('PATCH', `/productos/${id}`, { precio: null }, admin.token, 400);
  await pedir('PATCH', `/productos/${id}`, { activo: false }, admin.token);
  await pedir('GET', `/catalogo/${id}`, undefined, undefined, 404);
  await pedir('GET', `/catalogo/${id}?incluir_inactivos=true`, undefined, admin.token);
  await pedir('PATCH', `/productos/${id}`, { activo: true }, admin.token);
  await pedir('GET', `/catalogo/${id}`);
  const borrado = await pedir('DELETE', `/catalogo/${id}`, undefined, admin.token);
  comprobar(borrado.sincronizacion === 'OK', 'Baja sincronizada');
  await pedir('GET', `/catalogo/${id}`, undefined, undefined, 404);
  await pedir('DELETE', `/catalogo/${id}`, undefined, admin.token);
  const auditoria = await mongoDb.collection('eventos_auditoria').find({ 'detalle.id_producto': id }).toArray();
  comprobar(auditoria.filter(e => e.tipo === 'CAMBIO_PRECIO').length === 3, 'Auditoria de cada precio distinto');
  comprobar(auditoria.filter(e => e.tipo === 'CAMBIO_STOCK').length === 3, 'Auditoria de cada stock distinto');
  comprobar(auditoria.every(e => e.usuario.id === admin.usuario.id_usuario && e.usuario.rol === 'ADMIN'), 'Actor auditado');

  const datosCliente = { nombre: 'Cliente prueba', email: `cliente-${sufijo}@demo.test`, password: 'GasPasoDemo2026!',
    telefono: `9${randomInt(10000000,89999999)}`, direccion_principal: 'Direccion de prueba', id_comuna: 1 };
  await pedir('POST', '/auth/registro', { ...datosCliente, rol: 'ADMIN' }, undefined, 400);
  const creado = await pedir('POST', '/auth/registro', datosCliente, undefined, 201);
  comprobar(creado.usuario.rol === 'CLIENTE', 'Registro solo crea CLIENTE');
  const sesionNueva = await login(datosCliente.email);
  await pedir('GET', '/usuarios', undefined, sesionNueva.token, 403);
  const c = await oraclePool.getConnection();
  const antes = (await c.execute('SELECT COUNT(*) FROM Cliente')).rows[0][0];
  await pedir('POST', '/auth/registro', datosCliente, undefined, 409);
  const despues = (await c.execute('SELECT COUNT(*) FROM Cliente')).rows[0][0];
  comprobar(antes === despues, 'Registro duplicado no deja cliente huerfano');
  await c.close();
  await pedir('PATCH', `/usuarios/${creado.usuario.id_usuario}`, { activo: false }, admin.token);
  await pedir('GET', '/auth/me', undefined, sesionNueva.token, 401);
  await pedir('POST', '/auth/login', { email: datosCliente.email, password: datosCliente.password }, undefined, 401);
  await pedir('PATCH', `/usuarios/${creado.usuario.id_usuario}`, { activo: true }, admin.token);
  await pedir('GET', '/auth/me', undefined, sesionNueva.token, 401);
  const reactivado = await login(datosCliente.email);
  await pedir('GET', '/auth/me', undefined, reactivado.token);
  await pedir('PATCH', `/usuarios/${creado.usuario.id_usuario}`, { password: 'NuevaClaveDemo2026!' }, admin.token);
  await pedir('GET', '/auth/me', undefined, reactivado.token, 401);
  await pedir('POST', '/auth/login', { email: datosCliente.email, password: datosCliente.password }, undefined, 401);
  await pedir('POST', '/auth/login', { email: datosCliente.email, password: 'NuevaClaveDemo2026!' });
  await pedir('PATCH', `/usuarios/${creado.usuario.id_usuario}`, { rol: 'ADMIN' }, admin.token, 409);
  const nuevo = await pedir('POST', '/usuarios', { nombre: 'Empleado prueba', email: `empleado-${sufijo}@demo.test`,
    password: 'GasPasoDemo2026!', rol: 'ADMIN' }, admin.token, 201);
  const sesionAdminNueva = await login(nuevo.email);
  await pedir('PATCH', `/usuarios/${nuevo.id_usuario}`, { rol: 'REPARTIDOR' }, admin.token);
  await pedir('GET', '/auth/me', undefined, sesionAdminNueva.token, 401);
  await pedir('PUT', `/repartidores/${nuevo.id_empleado}/comunas`, { comunas: [1, 3] }, admin.token);
  await pedir('PUT', `/repartidores/${nuevo.id_empleado}/comunas`, { comunas: [1, 1] }, admin.token, 400);
  await pedir('PUT', `/repartidores/${nuevo.id_empleado}/comunas`, { comunas: [999999] }, admin.token, 400);
  const reps = await pedir('GET', '/repartidores?comuna=1', undefined, admin.token);
  const cobertura = reps.find(r => r.id_empleado === nuevo.id_empleado);
  comprobar(cobertura.cubre_comuna && cobertura.comunas.length === 2, 'Cobertura y rollback de cambio invalido');
  comprobar(reps[0].cubre_comuna, 'Primero repartidores que cubren la comuna');
  const empleado = { nombre: 'Repartidor alta', email: `repartidor-${sufijo}@demo.test`, password: 'GasPasoDemo2026!', rol: 'REPARTIDOR', comunas: [2, 4] };
  const altaRep = await pedir('POST', '/usuarios', empleado, admin.token, 201);
  const sesionRep = await login(empleado.email);
  comprobar(sesionRep.usuario.rol === 'REPARTIDOR', 'Alta directa de repartidor');
  const cc = await oraclePool.getConnection();
  const empleadosAntes = (await cc.execute('SELECT COUNT(*) FROM Empleado')).rows[0][0];
  await pedir('POST', '/usuarios', empleado, admin.token, 409);
  await pedir('POST', '/usuarios', { ...empleado, email: `invalido-${sufijo}@demo.test`, comunas: [999999] }, admin.token, 400);
  comprobar((await cc.execute('SELECT COUNT(*) FROM Empleado')).rows[0][0] === empleadosAntes, 'Altas rechazadas no dejan empleados huerfanos');
  await cc.close();
  const clienteAdmin = await pedir('POST', '/usuarios', { ...datosCliente, email: `cliente-admin-${sufijo}@demo.test`, telefono: `9${randomInt(10000000,89999999)}`, rol: 'CLIENTE' }, admin.token, 201);
  comprobar(clienteAdmin.rol === 'CLIENTE' && clienteAdmin.id_cliente, 'Alta de cliente por ADMIN');
  const repCreado = (await pedir('GET', '/repartidores?comuna=2', undefined, admin.token)).find(r => r.id_empleado === altaRep.id_empleado);
  comprobar(repCreado.cubre_comuna && repCreado.comunas.length === 2, 'Cobertura inicial del nuevo repartidor');
  const lista = await pedir('GET', '/usuarios', undefined, admin.token);
  comprobar(lista.every(u => !('password_hash' in u) && !('token_version' in u)), 'No exponer hashes ni version de sesion');
  await pedir('GET', '/auditoria?tipo=CAMBIO_PRECIO', undefined, admin.token);
  await pedir('POST', '/sincronizacion/reintentar', undefined, admin.token);
  await pedir('GET', '/auditoria', undefined, cliente.token, 403);
  console.log(`FASE 2 API OK: ${comprobaciones} comprobaciones.`);
} finally {
  await Promise.allSettled([mongoClient.close(), oraclePool.close(0)]);
}
