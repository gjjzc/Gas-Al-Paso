// Ejecutar por stdin con mongosh. Todas las escrituras se revierten al terminar.
const autenticacion = db.getSiblingDB('gas_al_paso');
autenticacion.auth(process.env.MONGO_APP_USER, process.env.MONGO_APP_PASSWORD);
const sesion = db.getMongo().startSession();
const base = sesion.getDatabase('gas_al_paso');
const ahora = new Date();
const id = 990000010;
function mostrar(nombre, valor) { print(nombre + ': ' + JSON.stringify(valor)); }
sesion.startTransaction();
try {
  const documentos = {
    catalogo: { id_producto: id, nombre: 'Gas Familiar', categoria: 'GAS', descripcion: 'Balón de 11 kg', imagen: '/productos/balon-11kg.webp', atributos: { peso_kg: 11 }, precio: 15000, stock: 10, activo: true, destacado: false, actualizado_en: ahora },
    clientes: { id_cliente: id, nombre: 'Valentina Soto', telefono: '912345670', direccion_principal: { calle: 'Los Aromos', numero: '10', comuna: 1, referencia: '' }, creado_en: ahora },
    pedidos: { id_venta: id, canal: 'WEB', cliente: { id_cliente: id, nombre: 'Valentina Soto', telefono: '912345670' }, direccion_entrega: { calle: 'Los Aromos', numero: '10', comuna: 'Santiago', id_comuna: 1, referencia: '' }, items: [{ id_producto: id, nombre: 'Gas Familiar', cantidad: 2, precio_unitario: 15000 }], subtotal: 30000, descuento: 3000, total: 27000, estado: 'RECIBIDO', estado_pago: 'PENDIENTE', metodo_pago: null, metodo_cobro: 'EFECTIVO', repartidor: null, historial_estados: [{ estado: 'RECIBIDO', fecha: ahora, por: 1 }], creado_en: ahora, fecha_cobro: null },
    cierres_caja: { fecha: '2000-01-01', id_empleado: 2, dinero: { efectivo: { esperado: 0, entregado: 0, diferencia: 0 }, transferencia: { esperado: 0, entregado: 0, diferencia: 0 }, total: { esperado: 0, entregado: 0, diferencia: 0 } }, balones: [], observacion: '', cerrado_en: ahora },
  };
  const cambios = { catalogo: { destacado: true }, clientes: { nombre: 'Valentina Rojas' }, pedidos: { 'direccion_entrega.referencia': 'Portón verde' }, cierres_caja: { observacion: 'Jornada revisada' } };
  for (const [nombre, doc] of Object.entries(documentos)) {
    const r = base.getCollection(nombre).insertOne(doc);
    const filtro = { _id: r.insertedId };
    mostrar('CREATE '+nombre, { acknowledged: r.acknowledged });
    mostrar('READ '+nombre, base.getCollection(nombre).findOne(filtro));
    mostrar('UPDATE '+nombre, base.getCollection(nombre).updateOne(filtro, { $set: cambios[nombre] }));
    mostrar('DELETE '+nombre, base.getCollection(nombre).deleteOne(filtro));
  }
} finally {
  sesion.abortTransaction();
  sesion.endSession();
}
print('CRUD completado; sin cambios persistentes.');
