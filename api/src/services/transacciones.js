import { mongoClient } from '../config/databases.js';

// El driver reintenta conflictos de escritura. Las claves únicas coordinan altas simultáneas.
export async function transaccion(accion) {
  for (let intento = 0; ; intento += 1) {
    try { return await mongoClient.withSession(session => session.withTransaction(() => accion(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })); }
    catch (error) {
      const concurrente = error.code === 11000 && (error.keyPattern?.telefono || error.keyPattern?.alcance);
      if (!concurrente || intento >= 3) throw error;
    }
  }
}
