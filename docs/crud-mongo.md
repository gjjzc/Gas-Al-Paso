# CRUD con MongoDB

La API aplica las reglas de stock, cobro y auditoría en transacciones. Las operaciones
manuales siguientes muestran la sintaxis del motor; no sustituyen los endpoints de
negocio. Usar una instalación aislada. El script abre una transacción y siempre la
revierte, incluso ante un error, para conservar el estado inicial.

```sh
docker compose exec -T mongo env HOME=/tmp/mongo-crud mongosh --quiet < docs/crud-operaciones.js
```

El script se autentica con el usuario de aplicación del entorno. Su base es
`gas_al_paso`; no usa privilegios de administración. Los documentos completos se
ajustan a los validadores de `db/mongo/init.js`.

Para cada colección se ejecutan estas cuatro operaciones, con un documento nuevo
`doc` y un filtro por su identificador Mongo:

```javascript
const doc = {
  id_producto: 990000010, nombre: 'Gas Familiar', categoria: 'GAS',
  descripcion: 'Balón de 11 kg', imagen: '/productos/balon-11kg.webp',
  atributos: { peso_kg: 11 }, precio: 15000, stock: 10,
  activo: true, destacado: false, actualizado_en: new Date()
};
const r = base.catalogo.insertOne(doc);                  // Create
base.catalogo.findOne({ _id: r.insertedId });             // Read
base.catalogo.updateOne({ _id: r.insertedId },
  { $set: { destacado: true } });                        // Update
base.catalogo.deleteOne({ _id: r.insertedId });            // Delete
```

Salida representativa:

```text
CREATE catalogo: {"acknowledged":true}
READ catalogo: { ..., "nombre":"Gas Familiar", "precio":15000, "stock":10, ... }
UPDATE catalogo: {"acknowledged":true,"matchedCount":1,"modifiedCount":1}
DELETE catalogo: {"acknowledged":true,"deletedCount":1}
```

Las demás colecciones usan el mismo patrón:

```javascript
const docCliente = {
  id_cliente: 990000010, nombre: 'Valentina Soto', telefono: '912345670',
  direccion_principal: { calle: 'Los Aromos', numero: '10', comuna: 1, referencia: '' },
  creado_en: new Date()
};
base.clientes.insertOne(docCliente);
base.clientes.findOne({ id_cliente: 990000010 });
base.clientes.updateOne({ id_cliente: 990000010 }, { $set: { nombre: 'Valentina Rojas' } });
base.clientes.deleteOne({ id_cliente: 990000010 });

const ahora = new Date();
const docPedido = {
  id_venta: 990000010, canal: 'WEB',
  cliente: { id_cliente: 990000010, nombre: 'Valentina Soto', telefono: '912345670' },
  direccion_entrega: { calle: 'Los Aromos', numero: '10', comuna: 'Santiago', id_comuna: 1, referencia: '' },
  items: [{ id_producto: 990000010, nombre: 'Gas Familiar', cantidad: 2, precio_unitario: 15000 }],
  subtotal: 30000, descuento: 3000, total: 27000,
  estado: 'RECIBIDO', estado_pago: 'PENDIENTE', metodo_pago: null,
  metodo_cobro: 'EFECTIVO', repartidor: null,
  historial_estados: [{ estado: 'RECIBIDO', fecha: ahora, por: 1 }],
  creado_en: ahora, fecha_cobro: null
};
base.pedidos.insertOne(docPedido);
base.pedidos.findOne({ id_venta: 990000010 });
base.pedidos.updateOne({ id_venta: 990000010 }, { $set: { 'direccion_entrega.referencia': 'Portón verde' } });
base.pedidos.deleteOne({ id_venta: 990000010 });

const docCierre = {
  fecha: '2000-01-01', id_empleado: 2,
  dinero: {
    efectivo: { esperado: 0, entregado: 0, diferencia: 0 },
    transferencia: { esperado: 0, entregado: 0, diferencia: 0 },
    total: { esperado: 0, entregado: 0, diferencia: 0 }
  },
  balones: [], observacion: '', cerrado_en: new Date()
};
base.cierres_caja.insertOne(docCierre);
base.cierres_caja.findOne({ fecha: '2000-01-01', id_empleado: 2 });
base.cierres_caja.updateOne({ fecha: '2000-01-01', id_empleado: 2 }, { $set: { observacion: 'Jornada revisada' } });
base.cierres_caja.deleteOne({ fecha: '2000-01-01', id_empleado: 2 });
```

El script agrupa estos cuerpos en `documentos` y usa la base de la sesión transaccional (`base`).
Cada Create devuelve `acknowledged: true`; cada Read devuelve el documento;
cada Update devuelve `matchedCount: 1, modifiedCount: 1`; cada Delete devuelve
`deletedCount: 1`. La última línea confirma que no quedan cambios persistentes.

En la aplicación, confirmar reserva stock, entregar cobra y cancelar repone stock.
Eliminar un pedido cancelado guarda primero su copia en `eventos_auditoria`.
Esas acciones deben hacerse mediante la API para mantener sus reglas.
