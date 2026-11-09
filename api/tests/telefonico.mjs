import { iniciar, req, cliente, producto, cerrar, ok, igual, telefono, clave, marca, mongoDb, direccion } from './tests/soporte/verificaciones.mjs';
try {
  const admin = await iniciar(), p = await producto(admin), tel = telefono();
  const datos = { cliente: { nombre: 'Cliente sin cuenta', telefono: `+56 ${tel}`, direccion: { calle: 'Llamada', numero: '2', comuna: 1 } }, items: [{ id_producto: p.id_producto, cantidad: 2 }], metodo_cobro: 'EFECTIVO' };
  const pedidos = await Promise.all(Array.from({ length: 3 }, () => req('POST', '/pedidos/telefonico', datos, admin, [200, 201], 'llamada-'+marca)));
  igual(pedidos.filter(p => !p.reutilizada).length, 1, 'Una sola creación concurrente');
  const docs = await mongoDb.collection('pedidos').find({ 'cliente.telefono': tel }).toArray();
  igual(docs.length, 1, 'Idempotencia telefónica concurrente');
  igual(await mongoDb.collection('clientes').countDocuments({ telefono: tel }), 1);
  const primero = docs[0];
  const reintento = await req('POST', '/pedidos/telefonico', datos, admin, 200, 'llamada-'+marca);
  igual(reintento.id_venta, primero.id_venta); ok(reintento.reutilizada);
  await req('POST', '/pedidos/telefonico', { ...datos, metodo_cobro: 'TRANSFERENCIA' }, admin, 409, 'llamada-'+marca);
  const password = clave(), email = `${marca}@llamada.test`;
  const registro = await req('POST', '/auth/registro', { nombre: 'Cliente vinculado', telefono: `0056${tel}`, direccion_principal: 'Llamada 2', id_comuna: 1, email, password }, undefined, 201);
  igual(registro.usuario.id_cliente, primero.cliente.id_cliente, 'Registro vincula el mismo cliente por teléfono');
  await req('POST', '/auth/registro', { nombre: 'Duplicado', telefono: tel, direccion_principal: 'X', id_comuna: 1, email: `otra-${email}`, password }, undefined, 409);
  const segundo = await req('POST', '/pedidos/telefonico', { id_cliente: registro.usuario.id_cliente, direccion_entrega: direccion, items: datos.items, metodo_cobro: 'TRANSFERENCIA', guardar_como_principal: true }, admin, 201, 'segunda-'+marca);
  igual(segundo.cliente.id_cliente, registro.usuario.id_cliente);
  const c = await cliente();
  await req('POST', '/pedidos/telefonico', datos, c.token, 403);
  await req('POST', '/pedidos/telefonico', { ...datos, cliente: { ...datos.cliente, telefono: 'abc' } }, admin, 400);
  const aud = await req('GET', '/auditoria?tipo=PEDIDO_TELEFONICO&limite=100', undefined, admin);
  igual(aud.filter(a => a.detalle.id_venta === primero.id_venta).length, 1, 'Una auditoría por llamada efectiva');
  ok(pedidos.length === 3);
} finally { await cerrar('M3 TELEFÓNICO'); }
