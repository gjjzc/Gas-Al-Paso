import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { conectarMongo, conectarRedis, mongoClient, mongoDb, redisClient } from '../../src/config/databases.js';
export { mongoDb, redisClient };
export const marca = randomUUID();
export const clave = () => randomBytes(24).toString('hex');
export const telefono = () => `9${randomInt(10000000, 89999999)}`;
export const direccion = { calle: 'Los Aromos', numero: '123', id_comuna: 1, referencia: '' };
let checks = 0;
export function ok(valor, mensaje) { assert.ok(valor, mensaje); checks += 1; }
export function igual(a, b, mensaje) { assert.deepEqual(a, b, mensaje); checks += 1; }
export async function req(method, path, body, token, estado = 200, key) {
  const r = await fetch(`http://127.0.0.1:4000/api${path}`, { method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const d = await r.json();
  if (Array.isArray(estado)) assert.ok(estado.includes(r.status), `${method} ${path}: estado ${r.status}`);
  else assert.equal(r.status, estado, `${method} ${path.split('?')[0]}: ${d.mensaje || 'estado inesperado'}`);
  checks += 1;
  return d;
}
export async function iniciar() {
  await Promise.all([conectarMongo(), conectarRedis()]);
  return (await req('POST', '/auth/login', { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD })).token;
}
export async function cliente() {
  const password = clave(), tel = telefono();
  const datos = { nombre: 'Valentina Soto', email: `${randomUUID()}@operaciones.test`, telefono: tel, password, direccion_principal: 'Los Aromos 123', id_comuna: 1 };
  const r = await req('POST', '/auth/registro', datos, undefined, 201);
  const login = await req('POST', '/auth/login', { email: datos.email, password });
  return { ...r.usuario, token: login.token, datos, password };
}
export async function repartidor(admin) {
  const password = clave(), email = `${randomUUID()}@operaciones.test`;
  const u = await req('POST', '/usuarios', { nombre: 'Javier Rojas', email, password, rol: 'REPARTIDOR', comunas: [1] }, admin, 201);
  return { ...u, token: (await req('POST', '/auth/login', { email, password })).token, password };
}
export async function producto(admin, cambios = {}) {
  return req('POST', '/catalogo', { nombre: `Producto ${randomUUID().slice(0, 8)}`, descripcion: 'Balón familiar', categoria: 'GAS', peso: 11, precio: 15000, stock: 100, ...cambios }, admin, 201);
}
export async function web(c, p, cantidad = 2, key = randomUUID()) {
  await req('POST', '/carrito/items', { id_producto: p.id_producto, cantidad }, c.token);
  return req('POST', '/pedidos', { direccion_entrega: direccion, metodo_cobro: 'EFECTIVO' }, c.token, 201, key);
}
export async function entregar(admin, r, p, metodo = 'EFECTIVO') {
  await req('PATCH', `/pedidos/${p._id}/asignar`, { id_empleado: r.id_empleado }, admin);
  await req('PATCH', `/pedidos/${p._id}/estado`, { estado: 'EN_CAMINO' }, r.token);
  return req('PATCH', `/pedidos/${p._id}/estado`, { estado: 'ENTREGADO', metodo_pago: metodo }, r.token);
}
export async function cerrar(nombre) {
  await Promise.allSettled([mongoClient.close(), redisClient.isOpen ? redisClient.quit() : Promise.resolve()]);
  console.log(`${nombre}: ${checks} comprobaciones.`);
}
