// Datos ficticios para desarrollo. Oracle conserva la verdad del dinero y el stock.
const base = db.getSiblingDB('gas_al_paso');
const numero = { bsonType: ['int', 'long', 'double', 'decimal'] };
const enteroPositivo = { ...numero, minimum: 1, multipleOf: 1 };
const noNegativo = { ...numero, minimum: 0 };
const item = {
  bsonType: 'object',
  required: ['id_producto', 'nombre', 'cantidad', 'precio_unitario'],
  properties: {
    id_producto: enteroPositivo,
    nombre: { bsonType: 'string' },
    cantidad: enteroPositivo,
    precio_unitario: noNegativo,
  },
};

function prepararColeccion(nombre, esquema) {
  const validator = { $jsonSchema: { bsonType: 'object', ...esquema } };
  if (base.getCollectionNames().includes(nombre)) {
    base.runCommand({ collMod: nombre, validator, validationLevel: 'strict' });
  } else {
    base.createCollection(nombre, { validator, validationLevel: 'strict' });
  }
}

prepararColeccion('catalogo', {
  required: ['id_producto', 'nombre', 'categoria', 'descripcion', 'imagen', 'atributos', 'destacado', 'activo'],
  properties: {
    id_producto: enteroPositivo,
    nombre: { bsonType: 'string' },
    categoria: { enum: ['GAS', 'ACCESORIO'] },
    descripcion: { bsonType: 'string' },
    imagen: { bsonType: 'string' },
    atributos: { bsonType: 'object' },
    destacado: { bsonType: 'bool' },
    activo: { bsonType: 'bool' },
  },
});
prepararColeccion('pedidos', {
  required: ['id_venta', 'canal', 'cliente', 'direccion_entrega', 'metodo_cobro', 'items',
    'subtotal', 'descuento', 'total', 'estado', 'historial_estados', 'creado_en'],
  properties: {
    id_venta: enteroPositivo,
    canal: { enum: ['WEB', 'LLAMADA', 'TARREO'] },
    cliente: {
      bsonType: 'object', required: ['id_cliente', 'nombre', 'telefono'],
      properties: { id_cliente: enteroPositivo, nombre: { bsonType: 'string' }, telefono: { bsonType: 'string' } },
    },
    direccion_entrega: {
      bsonType: 'object', required: ['calle', 'numero', 'comuna', 'referencia'],
      properties: {
        calle: { bsonType: 'string' }, numero: { bsonType: 'string' },
        comuna: { bsonType: 'string' }, referencia: { bsonType: 'string' },
      },
    },
    metodo_cobro: { enum: ['EFECTIVO', 'TRANSFERENCIA'] },
    items: { bsonType: 'array', minItems: 1, items: item },
    subtotal: noNegativo, descuento: noNegativo, total: noNegativo,
    estado: { enum: ['RECIBIDO', 'ASIGNADO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'] },
    repartidor: {
      bsonType: ['object', 'null'],
      required: ['id_empleado', 'nombre'],
      properties: { id_empleado: enteroPositivo, nombre: { bsonType: 'string' } },
    },
    historial_estados: {
      bsonType: 'array', minItems: 1,
      items: {
        bsonType: 'object', required: ['estado', 'fecha', 'por'],
        properties: {
          estado: { enum: ['RECIBIDO', 'ASIGNADO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'] },
          fecha: { bsonType: 'date' }, por: enteroPositivo,
        },
      },
    },
    creado_en: { bsonType: 'date' },
  },
});
prepararColeccion('carritos', {
  required: ['id_cliente', 'items', 'actualizado_en', 'expira_en'],
  properties: {
    id_cliente: enteroPositivo,
    items: { bsonType: 'array', items: item },
    actualizado_en: { bsonType: 'date' }, expira_en: { bsonType: 'date' },
  },
});
prepararColeccion('eventos_auditoria', {
  required: ['tipo', 'fecha', 'usuario', 'detalle'],
  properties: {
    tipo: { bsonType: 'string' }, fecha: { bsonType: 'date' },
    usuario: {
      bsonType: 'object', required: ['id', 'rol'],
      properties: { id: enteroPositivo, rol: { enum: ['ADMIN', 'REPARTIDOR', 'CLIENTE'] } },
    },
    detalle: { bsonType: 'object' },
  },
});

base.catalogo.createIndex({ id_producto: 1 }, { unique: true, name: 'uq_catalogo_producto' });
base.pedidos.createIndex({ id_venta: 1 }, { unique: true, name: 'uq_pedido_venta' });
base.pedidos.createIndex({ estado: 1 }, { name: 'ix_pedido_estado' });
base.pedidos.createIndex({ 'repartidor.id_empleado': 1 }, { name: 'ix_pedido_repartidor' });
base.pedidos.createIndex({ 'direccion_entrega.comuna': 1 }, { name: 'ix_pedido_comuna' });
base.pedidos.createIndex({ creado_en: -1 }, { name: 'ix_pedido_fecha' });
base.carritos.createIndex({ id_cliente: 1 }, { unique: true, name: 'uq_carrito_cliente' });
base.carritos.createIndex({ expira_en: 1 }, { expireAfterSeconds: 0, name: 'ttl_carrito' });
base.eventos_auditoria.createIndex({ fecha: -1, tipo: 1 }, { name: 'ix_auditoria_fecha_tipo' });

// SVG propio embebido: no depende de archivos ni servidores externos.
function imagenProducto(nombre, accesorio) {
  const dibujo = accesorio
    ? '<path d="M50 100h100v30H50z" fill="#FF6B1A"/><circle cx="100" cy="90" r="25" fill="#0B3D91"/>'
    : '<rect x="55" y="60" width="90" height="110" rx="25" fill="#0B3D91"/><path d="M80 60V40h40v20" fill="none" stroke="#FF6B1A" stroke-width="12"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220"><rect width="200" height="220" fill="#f7f9fc"/>${dibujo}<text x="100" y="200" text-anchor="middle" font-family="sans-serif" font-size="14">${nombre}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
const productos = [
  { id_producto: 1, nombre: 'Gas 5kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 5 kilos', atributos: { peso_kg: 5 }, destacado: false },
  { id_producto: 2, nombre: 'Gas 11kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 11 kilos', atributos: { peso_kg: 11 }, destacado: true },
  { id_producto: 3, nombre: 'Gas 15kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 15 kilos', atributos: { peso_kg: 15 }, destacado: true },
  { id_producto: 4, nombre: 'Gas 45kg', categoria: 'GAS', descripcion: 'Balón de gas licuado de 45 kilos', atributos: { peso_kg: 45 }, destacado: false },
  { id_producto: 5, nombre: 'Regulador de gas', categoria: 'ACCESORIO', descripcion: 'Regulador universal de ejemplo', atributos: { tipo: 'regulador' }, destacado: false },
  { id_producto: 6, nombre: 'Manguera de gas', categoria: 'ACCESORIO', descripcion: 'Manguera de conexión de ejemplo', atributos: { largo_m: 1 }, destacado: false },
];
for (const producto of productos) {
  base.catalogo.updateOne({ id_producto: producto.id_producto }, { $setOnInsert: {
    ...producto, imagen: imagenProducto(producto.nombre, producto.categoria === 'ACCESORIO'), activo: true,
  } }, { upsert: true });
}

const ahora = new Date();
const pedidos = [
  {
    _id: ObjectId('650000000000000000000001'), id_venta: 1, canal: 'WEB',
    cliente: { id_cliente: 1, nombre: 'Ana Demo', telefono: '+56900000001' },
    direccion_entrega: { calle: 'Calle Ejemplo', numero: '100', comuna: 'Santiago', referencia: 'Dirección ficticia' },
    metodo_cobro: 'EFECTIVO',
    items: [{ id_producto: 2, nombre: 'Gas 11kg', cantidad: 2, precio_unitario: 15000 }],
    subtotal: 30000, descuento: 3000, total: 27000, estado: 'ASIGNADO',
    repartidor: { id_empleado: 2, nombre: 'Camila Soto' },
    historial_estados: [{ estado: 'RECIBIDO', fecha: ahora, por: 4 }, { estado: 'ASIGNADO', fecha: ahora, por: 1 }],
    creado_en: ahora,
  },
  {
    _id: ObjectId('650000000000000000000002'), id_venta: 2, canal: 'LLAMADA',
    cliente: { id_cliente: 2, nombre: 'Bruno Demo', telefono: '+56900000002' },
    direccion_entrega: { calle: 'Calle Ejemplo', numero: '200', comuna: 'La Florida', referencia: 'Dirección ficticia' },
    metodo_cobro: 'TRANSFERENCIA',
    items: [{ id_producto: 3, nombre: 'Gas 15kg', cantidad: 1, precio_unitario: 20000 },
      { id_producto: 5, nombre: 'Regulador de gas', cantidad: 1, precio_unitario: 4000 }],
    subtotal: 24000, descuento: 0, total: 24000, estado: 'RECIBIDO', repartidor: null,
    historial_estados: [{ estado: 'RECIBIDO', fecha: ahora, por: 1 }], creado_en: ahora,
  },
];
for (const pedido of pedidos) {
  base.pedidos.updateOne({ _id: pedido._id }, { $setOnInsert: pedido }, { upsert: true });
}
// Un carrito de muestra. En FASE 2 cada cambio renovara actualizado_en y expira_en.
base.carritos.updateOne({ id_cliente: 3 }, { $setOnInsert: {
  id_cliente: 3, items: [{ id_producto: 1, nombre: 'Gas 5kg', cantidad: 1, precio_unitario: 8000 }],
  actualizado_en: ahora, expira_en: new Date(ahora.getTime() + 30 * 60 * 1000),
} }, { upsert: true });
base.eventos_auditoria.updateOne({ _id: ObjectId('650000000000000000000003') }, { $setOnInsert: {
  tipo: 'ASIGNACION', fecha: ahora, usuario: { id: 1, rol: 'ADMIN' },
  detalle: { id_venta: 1, id_empleado: 2, origen: 'semilla_desarrollo' },
} }, { upsert: true });
print('FASE 1: cuatro colecciones, índices y datos de ejemplo MongoDB OK');
