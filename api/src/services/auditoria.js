import { mongoDb } from '../config/databases.js';
export async function auditar(session, tipo, usuario, detalle) {
  await mongoDb.collection('eventos_auditoria').insertOne({
    tipo, fecha: new Date(), usuario: { id: usuario.id_usuario, rol: usuario.rol }, detalle,
  }, { session });
}
