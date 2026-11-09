// Modelo NoSQL. Este archivo no contiene cuentas, contraseñas ni hashes de usuarios.
// Se ejecuta en un volumen nuevo; los upserts no reponen stock al repetirlo.
const base = db.getSiblingDB('gas_al_paso');
const numero = { bsonType: ['int', 'long', 'double', 'decimal'] };
const entero = { bsonType: ['int', 'long', 'double'], multipleOf: 1 };
const id = { ...entero, minimum: 1, maximum: 999999999 };
const cantidad = { ...entero, minimum: 0, maximum: 999999999 };
const importe = { ...numero, minimum: 0, maximum: 9999999999.99 };
const texto = { bsonType: 'string', minLength: 1 };
const fecha = { bsonType: 'date' };
const dia = { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const telefono = { bsonType: 'string', pattern: '^9[0-9]{8}$' };
const roles = { enum: ['CLIENTE', 'REPARTIDOR', 'ADMIN'] };
const estados = { enum: ['RECIBIDO', 'ASIGNADO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'] };
const metodo = { enum: ['EFECTIVO', 'TRANSFERENCIA', null] };
function objeto(properties, required = Object.keys(properties)) {
  return { bsonType: 'object', additionalProperties: false, required, properties };
}
function coleccion(nombre, properties, required = Object.keys(properties), reglas = {}) {
  const esquema = { ...objeto({ _id: { bsonType: 'objectId' }, ...properties }, required), ...reglas };
  const validator = { $jsonSchema: esquema };
  if (base.getCollectionNames().includes(nombre)) {
    const resultado = base.runCommand({ collMod: nombre, validator, validationLevel: 'strict', validationAction: 'error' });
    if (resultado.ok !== 1) throw new Error(`No se pudo actualizar el validador de ${nombre}.`);
  } else {
    base.createCollection(nombre, { validator, validationLevel: 'strict', validationAction: 'error' });
  }
}

coleccion('contadores', { _id: texto, valor: cantidad });
coleccion('comunas', { id_comuna: id, nombre: { ...texto, maxLength: 80 } });
coleccion('catalogo', {
  id_producto: id, nombre: { ...texto, maxLength: 50 }, categoria: { enum: ['GAS', 'ACCESORIO'] },
  descripcion: { ...texto, maxLength: 100 },
  imagen: { bsonType: 'string', pattern: '(?i)^(?:/llama\\.svg|/productos/[a-zA-Z0-9_/-]+\\.(jpg|jpeg|png|webp|avif|gif|svg))$' },
  atributos: { bsonType: 'object' }, // Objeto libre solicitado para características del producto.
  precio: { ...cantidad, minimum: 1 }, stock: cantidad,
  activo: { bsonType: 'bool' }, destacado: { bsonType: 'bool' }, actualizado_en: fecha,
});
const principal = objeto({
  calle: { ...texto, maxLength: 200 }, numero: { bsonType: 'string', maxLength: 20 },
  comuna: id, referencia: { bsonType: 'string', maxLength: 200 },
});
coleccion('clientes', {
  id_cliente: id, nombre: { ...texto, maxLength: 80 }, telefono,
  direccion_principal: principal, creado_en: fecha, version: cantidad,
}, ['id_cliente', 'nombre', 'telefono', 'direccion_principal', 'creado_en']);
coleccion('empleados', {
  id_empleado: id, nombre: { ...texto, maxLength: 80 }, rol: { enum: ['REPARTIDOR', 'ADMIN'] },
  activo: { bsonType: 'bool' }, comunas: { bsonType: 'array', uniqueItems: true, items: id }, version_actividad: cantidad,
}, ['id_empleado', 'nombre', 'rol', 'activo', 'comunas']);
coleccion('usuarios', {
  id_usuario: id, email: { bsonType: 'string', maxLength: 254, pattern: '^[^\\s@A-Z]+@[^\\s@A-Z]+\\.[^\\s@A-Z]+$' },
  password_hash: { bsonType: 'string', pattern: '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$' },
  rol: roles, activo: { bsonType: 'bool' },
  id_empleado: { ...id, bsonType: ['int', 'long', 'double', 'null'] },
  id_cliente: { ...id, bsonType: ['int', 'long', 'double', 'null'] },
  token_version: cantidad, // Mantiene la revocación de JWT del contrato anterior.
}, undefined, {
  oneOf: [
    { properties: { rol: { enum: ['CLIENTE'] }, id_cliente: id, id_empleado: { bsonType: 'null' } } },
    { properties: { rol: { enum: ['ADMIN', 'REPARTIDOR'] }, id_empleado: id, id_cliente: { bsonType: 'null' } } },
  ],
});
const clientePedido = objeto({ id_cliente: id, nombre: { ...texto, maxLength: 80 }, telefono });
const direccionEntrega = objeto({
  calle: { ...texto, maxLength: 150 }, numero: { ...texto, maxLength: 20 }, comuna: texto,
  id_comuna: id, referencia: { bsonType: 'string', maxLength: 200 },
});
const item = objeto({
  id_producto: id, nombre: texto, cantidad: { ...cantidad, minimum: 1 },
  precio_unitario: { ...cantidad, minimum: 1 }, imagen: { bsonType: 'string' },
  subtotal: importe, descuento: importe, total: importe,
}, ['id_producto', 'nombre', 'cantidad', 'precio_unitario']);
const repartidor = objeto({ id_empleado: id, nombre: texto });
coleccion('pedidos', {
  id_venta: id, canal: { enum: ['WEB', 'LLAMADA', 'TARREO'] },
  cliente: { ...clientePedido, bsonType: ['object', 'null'] },
  direccion_entrega: { ...direccionEntrega, bsonType: ['object', 'null'] },
  items: { bsonType: 'array', minItems: 1, maxItems: 50, items: item },
  subtotal: importe, descuento: importe, total: importe,
  estado: estados, estado_pago: { enum: ['PENDIENTE', 'COBRADA', 'ANULADA'] }, metodo_pago: metodo,
  metodo_cobro: metodo, repartidor: { ...repartidor, bsonType: ['object', 'null'] },
  historial_estados: { bsonType: 'array', minItems: 1, items: objeto({ estado: estados, fecha, por: id }) },
  creado_en: fecha, fecha_cobro: { bsonType: ['date', 'null'] },
  // Campos de compatibilidad para folios, atribución de ventas y control de versiones.
  id_empleado: id, version: { ...cantidad, minimum: 1 },
}, ['id_venta', 'canal', 'cliente', 'direccion_entrega', 'items', 'subtotal', 'descuento', 'total',
  'estado', 'estado_pago', 'metodo_pago', 'metodo_cobro', 'repartidor', 'historial_estados', 'creado_en', 'fecha_cobro'], {
  oneOf: [
    { properties: { canal: { enum: ['TARREO'] }, cliente: { bsonType: 'null' }, direccion_entrega: { bsonType: 'null' }, estado: { enum: ['ENTREGADO'] }, repartidor } },
    { properties: { canal: { enum: ['WEB', 'LLAMADA'] }, cliente: clientePedido, direccion_entrega: direccionEntrega } },
  ],
  allOf: [{ oneOf: [
    { properties: { estado: { enum: ['ENTREGADO'] }, estado_pago: { enum: ['COBRADA'] }, metodo_pago: { enum: ['EFECTIVO', 'TRANSFERENCIA'] }, fecha_cobro: fecha } },
    { properties: { estado: { enum: ['CANCELADO'] }, estado_pago: { enum: ['ANULADA'] }, metodo_pago: { bsonType: 'null' } } },
    { properties: { estado: { enum: ['RECIBIDO', 'ASIGNADO', 'EN_CAMINO'] }, estado_pago: { enum: ['PENDIENTE'] }, metodo_pago: { bsonType: 'null' }, fecha_cobro: { bsonType: 'null' } } },
  ] }],
});
coleccion('cargas_diarias', {
  fecha: dia, id_empleado: id,
  items: { bsonType: 'array', minItems: 1, items: objeto({
    id_producto: id, cantidad_cargada: cantidad, id_carga: id,
  }, ['id_producto', 'cantidad_cargada']) },
});
const metodoCierre = objeto({ esperado: importe, entregado: importe, diferencia: numero });
coleccion('cierres_caja', {
  fecha: dia, id_empleado: id, id_cierre: id,
  dinero: objeto({ efectivo: metodoCierre, transferencia: metodoCierre, total: metodoCierre }),
  balones: { bsonType: 'array', items: objeto({
    id_producto: id, cargado: cantidad, vendido: cantidad, devuelto: cantidad, diferencia: entero,
  }) },
  observacion: { bsonType: 'string', maxLength: 500 }, cerrado_en: fecha,
}, ['fecha', 'id_empleado', 'dinero', 'balones', 'observacion', 'cerrado_en']);
coleccion('eventos_auditoria', {
  _id: { bsonType: ['objectId', 'string'] }, tipo: texto, fecha,
  usuario: objeto({ id, rol: roles }), detalle: { bsonType: 'object' },
}, ['tipo', 'fecha', 'usuario', 'detalle']);
coleccion('idempotencia', {
  alcance: texto, clave: { ...texto, maxLength: 100 }, resultado: { bsonType: 'object' }, creado_en: fecha,
});

base.comunas.createIndex({ id_comuna: 1 }, { unique: true, name: 'uq_comuna_id' });
base.comunas.createIndex({ nombre: 1 }, { unique: true, name: 'uq_comuna_nombre' });
base.catalogo.createIndex({ id_producto: 1 }, { unique: true, name: 'uq_catalogo_producto' });
base.catalogo.createIndex({ activo: 1, categoria: 1, id_producto: 1 }, { name: 'ix_catalogo_publico' });
base.clientes.createIndex({ id_cliente: 1 }, { unique: true, name: 'uq_cliente_id' });
base.clientes.createIndex({ telefono: 1 }, { unique: true, name: 'uq_cliente_telefono' });
base.empleados.createIndex({ id_empleado: 1 }, { unique: true, name: 'uq_empleado_id' });
base.empleados.createIndex({ rol: 1, activo: 1, comunas: 1 }, { name: 'ix_empleado_cobertura' });
base.usuarios.createIndex({ id_usuario: 1 }, { unique: true, name: 'uq_usuario_id' });
base.usuarios.createIndex({ email: 1 }, { unique: true, name: 'uq_usuario_email' });
for (const campo of ['id_empleado', 'id_cliente']) {
  base.usuarios.createIndex({ [campo]: 1 }, {
    unique: true, name: `uq_usuario_${campo}`, partialFilterExpression: { [campo]: { $type: 'number' } },
  });
}
base.usuarios.createIndex({ rol: 1, activo: 1 }, { name: 'ix_usuario_rol' });
base.pedidos.createIndex({ id_venta: 1 }, { unique: true, name: 'uq_pedido_venta' });
base.pedidos.createIndex({ estado: 1, creado_en: -1 }, { name: 'ix_pedido_estado' });
base.pedidos.createIndex({ 'repartidor.id_empleado': 1, estado: 1, creado_en: -1 }, { name: 'ix_pedido_repartidor' });
base.pedidos.createIndex({ 'direccion_entrega.id_comuna': 1, creado_en: -1 }, { name: 'ix_pedido_comuna' });
base.pedidos.createIndex({ 'direccion_entrega.comuna': 1, creado_en: -1 }, { name: 'ix_pedido_comuna_nombre' });
base.pedidos.createIndex({ creado_en: -1 }, { name: 'ix_pedido_fecha' });
base.pedidos.createIndex({ fecha_cobro: 1, 'repartidor.id_empleado': 1, estado_pago: 1 }, { name: 'ix_pedido_cobro' });
base.pedidos.createIndex({ 'cliente.id_cliente': 1, creado_en: -1, _id: -1 }, { name: 'ix_pedido_cliente_reciente' });
for (const nombre of ['cargas_diarias', 'cierres_caja']) {
  base[nombre].createIndex({ fecha: 1, id_empleado: 1 }, { unique: true, name: `uq_${nombre}_dia_empleado` });
  base[nombre].createIndex({ id_empleado: 1, fecha: -1 }, { name: `ix_${nombre}_empleado_fecha` });
}
base.eventos_auditoria.createIndex({ fecha: -1, tipo: 1 }, { name: 'ix_auditoria_fecha_tipo' });
base.eventos_auditoria.createIndex({ 'usuario.id': 1, fecha: -1 }, { name: 'ix_auditoria_usuario' });
base.idempotencia.createIndex({ alcance: 1, clave: 1 }, { unique: true, name: 'uq_idempotencia_alcance_clave' });
base.idempotencia.createIndex({ creado_en: 1 }, { expireAfterSeconds: 604800, name: 'ttl_idempotencia_7_dias' });
// No se crea carritos: su almacenamiento y expiración pertenecen exclusivamente a Redis.

const comunas = ['Santiago', 'Providencia', 'Ñuñoa', 'La Florida', 'Maipu', 'Puente Alto', 'San Miguel', 'La Cisterna'];
comunas.forEach((nombre, indice) => base.comunas.updateOne({ id_comuna: indice + 1 }, { $setOnInsert: { nombre } }, { upsert: true }));
const productos = [
  { id_producto: 1, nombre: 'Gas 5kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 5 kilos', imagen: '/productos/balon-5kg.webp', atributos: { peso_kg: 5 }, precio: 8000, stock: 50, destacado: false },
  { id_producto: 2, nombre: 'Gas 11kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 11 kilos', imagen: '/productos/balon-11kg.webp', atributos: { peso_kg: 11 }, precio: 15000, stock: 40, destacado: true },
  { id_producto: 3, nombre: 'Gas 15kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 15 kilos', imagen: '/productos/balon-15kg.webp', atributos: { peso_kg: 15 }, precio: 20000, stock: 30, destacado: true },
  { id_producto: 4, nombre: 'Gas 45kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 45 kilos', imagen: '/productos/balon-45kg.webp', atributos: { peso_kg: 45 }, precio: 55000, stock: 15, destacado: false },
  { id_producto: 5, nombre: 'Regulador de gas', categoria: 'ACCESORIO', descripcion: 'Regulador universal para balones', imagen: '/productos/regulador.webp', atributos: { peso_kg: 0.3 }, precio: 4000, stock: 100, destacado: false },
  { id_producto: 6, nombre: 'Manguera de gas', categoria: 'ACCESORIO', descripcion: 'Manguera de conexión para gas', imagen: '/productos/manguera.webp', atributos: { peso_kg: 0.2, largo_m: 1 }, precio: 3000, stock: 80, destacado: false },
];
for (const producto of productos) {
  base.catalogo.updateOne({ id_producto: producto.id_producto }, { $setOnInsert: { ...producto, activo: true, actualizado_en: new Date() } }, { upsert: true });
}
for (const empleado of [
  { id_empleado: 2, nombre: 'Camila Soto', rol: 'REPARTIDOR', activo: true, comunas: [1, 2, 3, 7] },
  { id_empleado: 3, nombre: 'Diego Rojas', rol: 'REPARTIDOR', activo: true, comunas: [4, 5, 6, 8] },
]) base.empleados.updateOne({ id_empleado: empleado.id_empleado }, { $setOnInsert: empleado }, { upsert: true });

// Nunca retroceder un contador al repetir las semillas; considerar documentos existentes.
for (const [campo, nombre] of Object.entries({
  id_comuna: 'comunas', id_producto: 'catalogo', id_cliente: 'clientes', id_empleado: 'empleados',
  id_usuario: 'usuarios', id_venta: 'pedidos', id_cierre: 'cierres_caja',
})) {
  const ultimo = base[nombre].find({}, { [campo]: 1 }).sort({ [campo]: -1 }).limit(1).toArray()[0];
  base.contadores.updateOne({ _id: campo }, { $max: { valor: ultimo?.[campo] || 0 } }, { upsert: true });
}
base.contadores.updateOne({ _id: 'id_carga' }, { $setOnInsert: { valor: 0 } }, { upsert: true });
base.contadores.updateOne({ _id: 'coordinacion_usuarios' }, { $setOnInsert: { valor: 0 } }, { upsert: true });
print('M2: once colecciones validadas, índices y semillas sin usuarios.');
