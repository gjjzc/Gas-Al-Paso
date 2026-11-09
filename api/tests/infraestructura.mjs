// Ejecutar por stdin dentro de /app: ver README. No requiere las rutas de negocio.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { conectarMongo, conectarRedis, mongoClient, mongoDb, redisClient } from './src/config/databases.js';

const sufijo = randomUUID().replaceAll('-', '');
const nombres = [`m1_control_a_${sufijo}`, `m1_control_b_${sufijo}`];
let sesion;
let sinCredenciales;
let comprobaciones = 0;
function comprobar(condicion, mensaje) {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
}

try {
  await Promise.all([conectarMongo(), conectarRedis()]);
  const salud = await fetch('http://127.0.0.1:4000/api/health', { signal: AbortSignal.timeout(12000) });
  const estado = await salud.json();
  comprobar(salud.status === 200 && estado.mongo === 'OK' && estado.redis === 'OK', 'Salud Mongo y Redis');
  const replica = await mongoDb.command({ hello: 1 });
  comprobar(replica.setName === 'rs0' && replica.isWritablePrimary, 'Replica set primario');
  const identidad = await mongoDb.command({ connectionStatus: 1 });
  assert.deepEqual(identidad.authInfo.authenticatedUserRoles, [{ role: 'readWrite', db: 'gas_al_paso' }]);
  comprobaciones += 1;
  await assert.rejects(mongoClient.db('otra_base').collection('control').insertOne({ control: true }), error => error.code === 13);
  comprobaciones += 1;

  sinCredenciales = new MongoClient(`mongodb://${process.env.MONGO_HOST}:27017`, { directConnection: true });
  await assert.rejects(sinCredenciales.db('gas_al_paso').collection('catalogo').findOne({}), error => error.code === 13);
  comprobaciones += 1;

  // Probar commit y rollback reales sobre dos colecciones independientes.
  for (const nombre of nombres) await mongoDb.createCollection(nombre);
  sesion = mongoClient.startSession();
  await sesion.withTransaction(async () => {
    for (const nombre of nombres) await mongoDb.collection(nombre).insertOne({ _id: 'confirmado' }, { session: sesion });
  });
  for (const nombre of nombres) comprobar(await mongoDb.collection(nombre).countDocuments() === 1, 'Commit multidocumento');
  await assert.rejects(sesion.withTransaction(async () => {
    for (const nombre of nombres) await mongoDb.collection(nombre).insertOne({ _id: 'revertido' }, { session: sesion });
    throw new Error('Rollback de integración');
  }), /Rollback de integración/);
  for (const nombre of nombres) comprobar(await mongoDb.collection(nombre).countDocuments() === 1, 'Rollback multidocumento');

  comprobar(await redisClient.ping() === 'PONG', 'Redis autenticado');
  comprobar((await redisClient.configGet('appendonly')).appendonly === 'yes', 'Redis con AOF');
  console.log(`M1 INFRAESTRUCTURA OK: ${comprobaciones} comprobaciones.`);
} finally {
  if (sesion) await sesion.endSession();
  for (const nombre of nombres) await mongoDb.collection(nombre).drop().catch(() => {});
  await Promise.allSettled([
    sinCredenciales?.close(),
    mongoClient.close(),
    redisClient.isOpen ? redisClient.quit() : Promise.resolve(),
  ]);
}
