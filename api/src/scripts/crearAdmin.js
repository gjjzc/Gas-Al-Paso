import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';
import { conectarMongo, mongoClient, mongoDb } from '../config/databases.js';
import { siguienteId } from '../services/contadores.js';
import { correo, password } from '../middlewares/validar.js';

export async function crearAdminInicial() {
  // Una cuenta existente no se modifica aunque cambien las variables del entorno.
  if (await mongoDb.collection('usuarios').findOne({ rol: 'ADMIN' })) return false;
  const email = correo(process.env.ADMIN_EMAIL);
  const clave = password(process.env.ADMIN_PASSWORD);
  const hash = await bcrypt.hash(clave, 12);
  return mongoClient.withSession(session => session.withTransaction(async () => {
    if (await mongoDb.collection('usuarios').findOne({ rol: 'ADMIN' }, { session })) return false;
    // El contador compartido provoca reintento de la transacción si dos APIs inician juntas.
    const id_usuario = await siguienteId('id_usuario', session);
    const id_empleado = await siguienteId('id_empleado', session);
    await mongoDb.collection('empleados').insertOne({
      id_empleado, nombre: 'Administración', rol: 'ADMIN', activo: true, comunas: [],
    }, { session });
    await mongoDb.collection('usuarios').insertOne({
      id_usuario, email, password_hash: hash, rol: 'ADMIN', activo: true,
      id_empleado, id_cliente: null, token_version: 0,
    }, { session });
    return true;
  }));
}

// También permite ejecutarlo manualmente dentro del contenedor, sin imprimir secretos.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await conectarMongo();
    console.log(await crearAdminInicial() ? 'ADMIN inicial creado.' : 'Ya existe un ADMIN; no se modificó.');
  } finally {
    await mongoClient.close();
  }
}
