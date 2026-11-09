import { iniciar, req, cliente, producto, web, cerrar, ok, igual, telefono, marca } from './tests/soporte/verificaciones.mjs';
try {
  const admin = await iniciar(), c = await cliente(), p = await producto(admin);
  await req('GET', '/clientes?telefono=123', undefined, admin, 400);
  await req('GET', '/clientes?telefono=1234', undefined, c.token, 403);
  const pedido = await web(c, p);
  const encontrados = await req('GET', `/clientes?telefono=${c.datos.telefono}`, undefined, admin);
  const ficha = encontrados.find(e => e.id_cliente === c.id_cliente);
  igual(ficha.cantidad_pedidos, 1); igual(ficha.telefono, c.datos.telefono);
  const editada = await req('PATCH', `/clientes/${c.id_cliente}`, { nombre: "María O'Connor", direccion_principal: { calle: 'Nueva', numero: '3A', comuna: 2, referencia: 'Timbre' } }, admin);
  igual(editada.direccion_entrega_sugerida.numero, '3A'); igual(editada.id_comuna, 2);
  const vieja = await req('GET', `/pedidos/${pedido._id}`, undefined, admin);
  igual(vieja.direccion_entrega.calle, 'Los Aromos', 'Cambiar ficha no reescribe snapshots');
  await req('PATCH', `/clientes/${c.id_cliente}`, { direccion_principal: 'Dirección libre sin número', id_comuna: 1 }, admin);
  const detalle = await req('GET', `/clientes/${c.id_cliente}`, undefined, admin);
  igual(detalle.direccion_entrega_sugerida, null, 'No se inventa un número');
  await req('PATCH', `/clientes/${c.id_cliente}`, { direccion_principal: 'Los Aromos 123' }, admin);
  const recuperada = await req('GET', `/clientes/${c.id_cliente}`, undefined, admin);
  igual(recuperada.direccion_entrega_sugerida.numero, '123', 'Recupera una dirección realmente registrada');
  const nuevo = telefono();
  await req('PATCH', `/usuarios/${c.id_usuario}`, { telefono: nuevo }, admin);
  const renumerado = await req('GET', `/clientes?telefono=${nuevo}`, undefined, admin);
  igual(renumerado[0].cantidad_pedidos, 1, 'Historial asociado por ID');
  const audit = await req('GET', '/auditoria?tipo=CLIENTE_ACTUALIZADO&limite=100', undefined, admin);
  ok(audit.some(a => a.detalle.id_cliente === c.id_cliente));
} finally { await cerrar('M3 CLIENTES'); }
