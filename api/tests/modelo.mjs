// Ejecutar por stdin desde /app con datos iniciales M2. Usa claves solo del entorno.
import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { conectarMongo, mongoClient, mongoDb } from './src/config/databases.js';
import { siguienteId } from './src/services/contadores.js';
import { crearAdminInicial } from './src/scripts/crearAdmin.js';

let checks = 0;
const limpieza = [];
function comprobar(condicion, mensaje) { assert.ok(condicion, mensaje); checks += 1; }
async function rechazar(nombre, documento, codigo) {
  await assert.rejects(mongoDb.collection(nombre).insertOne(documento), error => error.code === codigo);
  checks += 1;
}
async function temporal(nombre, documento) {
  const resultado = await mongoDb.collection(nombre).insertOne(documento);
  limpieza.push([nombre, resultado.insertedId]);
}
async function pedir(ruta, datos, token, esperado = 200) {
  const r = await fetch(`http://127.0.0.1:4000/api${ruta}`, {
    method: datos === undefined ? 'GET' : 'POST',
    headers: { ...(datos ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: datos ? JSON.stringify(datos) : undefined, signal: AbortSignal.timeout(15000),
  });
  comprobar(r.status === esperado, `Estado HTTP esperado para ${ruta}`);
  return r.json();
}

try {
  await conectarMongo();
  const nombres = ['contadores', 'comunas', 'catalogo', 'clientes', 'empleados', 'usuarios', 'pedidos',
    'cargas_diarias', 'cierres_caja', 'eventos_auditoria', 'idempotencia'];
  const colecciones = await mongoDb.listCollections().toArray();
  comprobar(colecciones.length === nombres.length && nombres.every(n => colecciones.some(c => c.name === n)), 'Once colecciones, sin carritos');
  for (const c of colecciones) {
    comprobar(c.options.validationLevel === 'strict' && c.options.validationAction === 'error' &&
      c.options.validator.$jsonSchema.additionalProperties === false, `Validador estricto en ${c.name}`);
    await rechazar(c.name, {}, 121);
    const indices = await mongoDb.collection(c.name).indexes();
    const ttl = indices.filter(i => i.expireAfterSeconds !== undefined);
    comprobar(c.name === 'idempotencia' ? ttl.length === 1 && ttl[0].expireAfterSeconds === 604800 : ttl.length === 0, `TTL solo en idempotencia: ${c.name}`);
  }
  for (const [nombre, campos] of [
    ['catalogo', { id_producto: 1 }], ['clientes', { telefono: 1 }], ['usuarios', { email: 1 }],
    ['pedidos', { id_venta: 1 }], ['cargas_diarias', { fecha: 1, id_empleado: 1 }],
    ['cierres_caja', { fecha: 1, id_empleado: 1 }], ['idempotencia', { alcance: 1, clave: 1 }],
  ]) {
    const indices = await mongoDb.collection(nombre).indexes();
    comprobar(indices.some(i => i.unique && JSON.stringify(i.key) === JSON.stringify(campos)), `Índice único ${nombre}`);
  }
  const indicesPedidos = await mongoDb.collection('pedidos').indexes();
  for (const campo of ['estado', 'repartidor.id_empleado', 'direccion_entrega.id_comuna', 'creado_en', 'fecha_cobro', 'cliente.id_cliente']) {
    comprobar(indicesPedidos.some(i => Object.hasOwn(i.key, campo)), `Índice de consulta por ${campo}`);
  }
  comprobar(await mongoDb.collection('comunas').countDocuments() === 8, 'Ocho comunas');
  const productos = await mongoDb.collection('catalogo').find().sort({ id_producto: 1 }).toArray();
  comprobar(productos.length === 6 && productos.every(p => Number.isInteger(p.precio) && p.precio > 0 && Number.isInteger(p.stock) && p.stock >= 0), 'Seis productos con precio y stock');
  const { address: hostFrontend } = await lookup('frontend', { family: 4 });
  for (const p of productos) {
    comprobar(p.imagen.startsWith('/productos/') && p.imagen.endsWith('.webp'), 'Ruta WebP final');
    const r = await fetch(`http://${hostFrontend}:3000${p.imagen}`, { signal: AbortSignal.timeout(15000) });
    const bytes = new Uint8Array(await r.arrayBuffer());
    comprobar(r.ok && bytes.length < 200000 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP', `Imagen WebP existente de producto ${p.id_producto}`);
  }
  const repartidores = await mongoDb.collection('empleados').find({ rol: 'REPARTIDOR' }).sort({ id_empleado: 1 }).toArray();
  comprobar(repartidores.length === 2 && JSON.stringify(repartidores[0].comunas) === '[1,2,3,7]' &&
    JSON.stringify(repartidores[1].comunas) === '[4,5,6,8]', 'Cobertura embebida de repartidores');
  for (const nombre of ['clientes', 'pedidos', 'cargas_diarias', 'cierres_caja', 'eventos_auditoria', 'idempotencia']) {
    comprobar(await mongoDb.collection(nombre).countDocuments() === 0, `Sin datos ficticios en ${nombre}`);
  }
  const { _id, ...producto } = productos[0];
  await rechazar('catalogo', { ...producto, stock: -1 }, 121);
  await rechazar('catalogo', { ...producto, stock: 1.5 }, 121);
  await rechazar('catalogo', { ...producto, precio: 1.5 }, 121);
  await rechazar('catalogo', { ...producto, inesperado: true }, 121);
  await rechazar('catalogo', { ...producto, actualizado_en: 'hoy' }, 121);
  await rechazar('catalogo', producto, 11000);
  const pedido = { id_venta: 990000001, canal: 'TARREO', cliente: null, direccion_entrega: null,
    items: [{ id_producto: 1, nombre: 'Gas 5kg', cantidad: 1, precio_unitario: 8000 }],
    subtotal: 8000, descuento: 0, total: 8000, estado: 'ENTREGADO', estado_pago: 'COBRADA',
    metodo_pago: 'EFECTIVO', metodo_cobro: 'EFECTIVO', repartidor: { id_empleado: 2, nombre: 'Camila Soto' },
    historial_estados: [{ estado: 'ENTREGADO', fecha: new Date(), por: 1 }], creado_en: new Date(), fecha_cobro: new Date() };
  await temporal('pedidos', pedido);
  await rechazar('pedidos', { ...pedido, _id: undefined }, 11000);
  await rechazar('pedidos', { ...pedido, _id: undefined, estado_pago: 'PENDIENTE' }, 121);
  await rechazar('pedidos', { ...pedido, _id: undefined, fecha_cobro: null }, 121);
  await rechazar('pedidos', { ...pedido, _id: undefined, cliente: {} }, 121);
  const cliente = { id_cliente: 990000001, nombre: 'Contacto temporal', telefono: `9${randomInt(10000000, 89999999)}`,
    direccion_principal: { calle: 'Temporal', numero: '1', comuna: 1, referencia: '' }, creado_en: new Date() };
  await temporal('clientes', cliente);
  await rechazar('clientes', { ...cliente, _id: undefined, id_cliente: 990000002 }, 11000);
  await rechazar('clientes', { ...cliente, _id: undefined, telefono: '+56912345678' }, 121);
  await rechazar('clientes', { ...cliente, _id: undefined, direccion_principal: { ...cliente.direccion_principal, extra: 1 } }, 121);
  const carga = { fecha: '2000-01-01', id_empleado: 2, items: [{ id_producto: 1, cantidad_cargada: 10 }] };
  await temporal('cargas_diarias', carga);
  await rechazar('cargas_diarias', { ...carga, _id: undefined }, 11000);
  const cierre = { fecha: '2000-01-01', id_empleado: 2,
    dinero: { efectivo: { esperado: 100, entregado: 90, diferencia: -10 }, transferencia: { esperado: 0, entregado: 0, diferencia: 0 }, total: { esperado: 100, entregado: 90, diferencia: -10 } },
    balones: [{ id_producto: 1, cargado: 10, vendido: 3, devuelto: 6, diferencia: -1 }], observacion: 'Descuadre de integración', cerrado_en: new Date() };
  await temporal('cierres_caja', cierre);
  await rechazar('cierres_caja', { ...cierre, _id: undefined }, 11000);
  const reintento = { alcance: `modelo:${randomUUID()}`, clave: 'control', resultado: {}, creado_en: new Date() };
  await temporal('idempotencia', reintento);
  await rechazar('idempotencia', { ...reintento, _id: undefined }, 11000);

  const contador = `control_modelo_${randomUUID()}`;
  await temporal('contadores', { _id: contador, valor: 0 });
  const ids = await Promise.all(Array.from({ length: 32 }, () => siguienteId(contador)));
  comprobar(new Set(ids).size === 32 && Math.min(...ids) === 1 && Math.max(...ids) === 32, '$inc genera IDs únicos concurrentes');

  const admin = await mongoDb.collection('usuarios').findOne({ rol: 'ADMIN' });
  comprobar(admin?.email === process.env.TEST_ADMIN_EMAIL.trim().toLowerCase() && admin.activo === true, 'ADMIN inicial desde el entorno');
  comprobar(admin.password_hash !== process.env.TEST_ADMIN_PASSWORD && /^\$2[aby]\$12\$/.test(admin.password_hash), 'Solo hash bcrypt costo 12 en Mongo');
  const { _id: idAdmin, ...usuario } = admin;
  await rechazar('usuarios', { ...usuario, id_usuario: 990000003, id_empleado: 2 }, 11000);
  await rechazar('usuarios', { ...usuario, activo: 1 }, 121);
  await rechazar('usuarios', { ...usuario, rol: 'CLIENTE', id_cliente: null }, 121);
  await rechazar('usuarios', { ...usuario, email: usuario.email.toUpperCase() }, 121);
  comprobar((await Promise.all(Array.from({ length: 8 }, () => crearAdminInicial()))).every(r => r === false), 'Bootstrap concurrente no recrea el ADMIN');
  const conservado = await mongoDb.collection('usuarios').findOne({ _id: idAdmin });
  comprobar(conservado.password_hash === admin.password_hash && await mongoDb.collection('usuarios').countDocuments() === 1, 'Bootstrap conserva cuenta y hash');

  const login = await pedir('/auth/login', { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD });
  comprobar(login.usuario.rol === 'ADMIN' && login.usuario.activo === true && Number.isInteger(login.usuario.id_usuario) && Number.isInteger(login.usuario.id_empleado), 'Login mantiene rol, actividad e IDs numéricos');
  comprobar(login.tipo === 'Bearer' && login.expira_en === 3600 && !('password_hash' in login.usuario) && !('token_version' in login.usuario) && !('_id' in login.usuario), 'Contrato público sin campos sensibles');
  const me = await pedir('/auth/me', undefined, login.token);
  comprobar(me.id_usuario === admin.id_usuario && me.email === admin.email, 'JWT permite consultar la sesión vigente');
  await pedir('/auth/login', { email: process.env.TEST_ADMIN_EMAIL, password: randomBytes(24).toString('hex') }, undefined, 401);
  await pedir('/auth/me', undefined, undefined, 401);
  console.log(`M2 MODELO Y ADMIN OK: ${checks} comprobaciones.`);
} finally {
  for (const [nombre, _id] of limpieza.reverse()) await mongoDb.collection(nombre).deleteOne({ _id });
  await mongoClient.close();
}
