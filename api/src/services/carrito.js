import { createHash } from 'node:crypto';
import { mongoDb, redisClient } from '../config/databases.js';
import { conImagenes } from './imagenes.js';
import { calcular } from './importes.js';
import { exigir, entero } from '../middlewares/validar.js';
import { ErrorHttp } from '../middlewares/errores.js';

// La API de Compose es un único proceso. Serializar sus operaciones de carrito y checkout.
// Los cambios del HASH, además, son atómicos en Redis mediante Lua.
const turnos = new Map();
export async function conCarritoBloqueado(id, accion) {
  const anterior = turnos.get(id) || Promise.resolve();
  let liberar;
  const turno = new Promise(resolve => { liberar = resolve; });
  turnos.set(id, turno);
  await anterior;
  try { return await accion(); }
  finally { liberar(); if (turnos.get(id) === turno) turnos.delete(id); }
}
async function redis(accion) {
  try { return await accion(); }
  catch (error) { if (error.estado) throw error; throw new ErrorHttp(503, 'Una base de datos no esta disponible. Intenta nuevamente.'); }
}
const leer = `return {redis.call('HGETALL',KEYS[1]),redis.call('PEXPIRETIME',KEYS[1])}`;
export async function leerCarrito(id) {
  const [pares, expira] = await redis(() => redisClient.eval(leer, { keys: [`carrito:${id}`], arguments: [] }));
  if (!pares.length || expira < 0) return null;
  const items = [];
  for (let n = 0; n < pares.length; n += 2) items.push({ id_producto: Number(pares[n]), ...JSON.parse(pares[n + 1]) });
  items.sort((a, b) => a.id_producto - b.id_producto);
  const version = createHash('sha256').update(JSON.stringify({ id, expira, items })).digest('hex');
  return { items, version, expira_en: new Date(expira), actualizado_en: new Date(expira - 1800000), pares, expira };
}
export const versionCarrito = carrito => carrito.version;
export async function limpiarConsumido(id, snapshot) {
  if (!snapshot) return;
  const codigo = `
    if tonumber(redis.call('PEXPIRETIME',KEYS[1]))~=tonumber(ARGV[1]) then return 0 end
    if redis.call('HLEN',KEYS[1])~=(#ARGV-1)/2 then return 0 end
    for i=2,#ARGV,2 do if redis.call('HGET',KEYS[1],ARGV[i])~=ARGV[i+1] then return 0 end end
    return redis.call('DEL',KEYS[1])`;
  await redis(() => redisClient.eval(codigo, { keys: [`carrito:${id}`], arguments: [String(snapshot.expira), ...snapshot.pares] }));
}
async function disponible(id) {
  const carrito = await leerCarrito(id);
  if (carrito && await mongoDb.collection('idempotencia').findOne({ alcance: 'carrito', clave: carrito.version })) {
    await limpiarConsumido(id, carrito); return null;
  }
  return carrito;
}
export function importes(items) { const { subtotal, descuento, total } = calcular(items); return { subtotal, descuento, total }; }
async function presentar(id, carrito) {
  const items = await conImagenes(carrito?.items || []);
  return { id_cliente: id, items, ...importes(items), version: carrito?.version || null,
    actualizado_en: carrito?.actualizado_en || null, expira_en: carrito?.expira_en || null };
}
export const obtener = id => conCarritoBloqueado(id, async () => presentar(id, await disponible(id)));
const modificarHash = `
  local campo=ARGV[2]; local anterior=redis.call('HGET',KEYS[1],campo)
  if ARGV[1]=='QUITAR' then
    if not anterior then return 'NO_ITEM' end
    redis.call('HDEL',KEYS[1],campo)
  else
    if ARGV[1]=='CAMBIAR' and not anterior then return 'NO_ITEM' end
    local item=cjson.decode(ARGV[3])
    if ARGV[1]=='AGREGAR' and anterior then item.cantidad=item.cantidad+cjson.decode(anterior).cantidad end
    if item.cantidad>9999 then return 'CANTIDAD' end
    if not anterior and redis.call('HLEN',KEYS[1])>=50 then return 'LIMITE' end
    redis.call('HSET',KEYS[1],campo,cjson.encode(item))
  end
  redis.call('EXPIRE',KEYS[1],1800)
  return 'OK'`;
export async function modificar(usuario, accion, idProducto, cantidad) {
  return conCarritoBloqueado(usuario.id_cliente, async () => {
    exigir(await mongoDb.collection('clientes').findOne({ id_cliente: usuario.id_cliente }), 'Cliente no encontrado.', 404);
    await disponible(usuario.id_cliente);
    if (accion === 'VACIAR') {
      await redis(() => redisClient.del(`carrito:${usuario.id_cliente}`));
      return presentar(usuario.id_cliente, null);
    }
    let item = {};
    if (accion !== 'QUITAR') {
      const p = await mongoDb.collection('catalogo').findOne({ id_producto: idProducto, activo: true });
      exigir(p, 'Producto activo no encontrado.', 404);
      entero(cantidad, 'cantidad', 1, 9999);
      item = { nombre: p.nombre, cantidad, precio_unitario: p.precio };
    }
    const r = await redis(() => redisClient.eval(modificarHash, { keys: [`carrito:${usuario.id_cliente}`], arguments: [accion, String(idProducto), JSON.stringify(item)] }));
    exigir(r !== 'NO_ITEM', 'El producto no esta en tu carrito.', 404);
    exigir(r !== 'CANTIDAD', 'cantidad debe ser un entero entre 1 y 9999.');
    exigir(r !== 'LIMITE', 'El carrito admite hasta 50 productos distintos.');
    return presentar(usuario.id_cliente, await leerCarrito(usuario.id_cliente));
  });
}
