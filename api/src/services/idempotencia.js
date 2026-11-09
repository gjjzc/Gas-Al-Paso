import { createHash, randomUUID } from 'node:crypto';
import { mongoDb } from '../config/databases.js';
import { transaccion } from './transacciones.js';
import { exigir } from '../middlewares/validar.js';
export const huella = datos => createHash('sha256').update(JSON.stringify(datos)).digest('hex');

export async function idempotente(alcance, clave, datos, accion, repetir) {
  clave ||= randomUUID();
  const hash = huella(datos);
  const r = await transaccion(async session => {
    const anterior = await mongoDb.collection('idempotencia').findOne({ alcance, clave }, { session });
    if (anterior) {
      exigir(anterior.resultado.huella === hash, 'Idempotency-Key ya se uso con otros datos.', 409);
      return { salida: repetir ? await repetir(anterior.resultado.salida, session) : anterior.resultado.salida, reutilizada: true };
    }
    const salida = await accion(session);
    await mongoDb.collection('idempotencia').insertOne({ alcance, clave, resultado: { huella: hash, salida }, creado_en: new Date() }, { session });
    return { salida, reutilizada: false };
  });
  return { ...r.salida, clave_idempotencia: clave, reutilizada: r.reutilizada, sincronizacion: 'OK' };
}
