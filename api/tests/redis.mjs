import { iniciar, cliente, producto, req, cerrar, ok, igual, redisClient, mongoDb, direccion } from './tests/soporte/verificaciones.mjs';
try {
  const admin = await iniciar(), c = await cliente(), p = await producto(admin);
  await req('POST', '/carrito/items', { id_producto: p.id_producto, cantidad: 1 }, c.token);
  const key = `carrito:${c.id_cliente}`;
  ok(await redisClient.ttl(key) > 1790, 'TTL inicial de 1800 segundos');
  await redisClient.pExpire(key, 5000);
  await req('PATCH', `/carrito/items/${p.id_producto}`, { cantidad: 2 }, c.token);
  ok(await redisClient.ttl(key) > 1790, 'Cada modificación renueva el TTL');
  const fecha = (await req('GET', '/carrito', undefined, c.token)).expira_en;
  igual((await req('GET', '/carrito', undefined, c.token)).expira_en, fecha, 'Consultar no renueva la expiración');
  // Acortar solo el reloj del carrito aislado permite verificar la eliminación real sin esperar 30 minutos.
  await redisClient.pExpire(key, 80);
  await new Promise(resolve => setTimeout(resolve, 150));
  igual(await redisClient.exists(key), 0, 'Redis elimina el HASH vencido');
  igual((await req('GET', '/carrito', undefined, c.token)).items, []);
  const antes = await mongoDb.collection('pedidos').countDocuments({ 'cliente.id_cliente': c.id_cliente });
  await req('POST', '/pedidos', { direccion_entrega: direccion, metodo_cobro: 'EFECTIVO' }, c.token, 409);
  igual(await mongoDb.collection('pedidos').countDocuments({ 'cliente.id_cliente': c.id_cliente }), antes);
} finally { await cerrar('M4 REDIS TTL'); }
