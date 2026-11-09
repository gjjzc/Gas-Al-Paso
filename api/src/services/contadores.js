import { mongoDb } from '../config/databases.js';

// Cada entidad conserva su ID numérico. $inc es atómico, también dentro de transacciones.
export async function siguienteId(nombre, session) {
  const contador = await mongoDb.collection('contadores').findOneAndUpdate(
    { _id: nombre }, { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after', session },
  );
  return contador.valor;
}
