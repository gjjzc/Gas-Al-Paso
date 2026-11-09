import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { createClient } from 'redis';

const requeridas = ['MONGO_HOST', 'MONGO_APP_USER', 'MONGO_APP_PASSWORD', 'MONGO_DATABASE', 'REDIS_HOST', 'REDIS_PASSWORD'];
const faltantes = requeridas.filter(nombre => !process.env[nombre]);
if (faltantes.length) throw new Error(`Faltan variables de base de datos: ${faltantes.join(', ')}.`);

// Las credenciales van como opciones, sin interpolarlas en la URL ni registrarlas.
export const mongoClient = new MongoClient(
  `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT || 27017}`,
  {
    auth: { username: process.env.MONGO_APP_USER, password: process.env.MONGO_APP_PASSWORD },
    authSource: process.env.MONGO_DATABASE,
    replicaSet: process.env.MONGO_REPLICA_SET || 'rs0',
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
  },
);
export const mongoDb = mongoClient.db(process.env.MONGO_DATABASE);

export const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
    connectTimeout: 5000,
    reconnectStrategy: intentos => Math.min(200 * (intentos + 1), 3000),
  },
  password: process.env.REDIS_PASSWORD,
  disableOfflineQueue: true,
});
// Redis requiere escuchar este evento; no imprimir mensajes que puedan contener secretos.
redisClient.on('error', () => console.error('Conexion Redis no disponible.'));

let intentoMongo;
export async function conectarMongo() {
  if (!intentoMongo) intentoMongo = mongoClient.connect().finally(() => { intentoMongo = undefined; });
  await intentoMongo;
  return mongoDb;
}

let intentoRedis;
export async function conectarRedis() {
  if (redisClient.isReady) return redisClient;
  if (!intentoRedis) intentoRedis = redisClient.connect().finally(() => { intentoRedis = undefined; });
  await intentoRedis;
  return redisClient;
}
