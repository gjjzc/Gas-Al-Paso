import 'dotenv/config';
import oracledb from 'oracledb';
import { MongoClient } from 'mongodb';

const requeridas = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING', 'MONGO_HOST', 'MONGO_USER', 'MONGO_PASSWORD', 'MONGO_DATABASE'];
const faltantes = requeridas.filter(nombre => !process.env[nombre]);
if (faltantes.length) throw new Error(`Faltan variables de base de datos: ${faltantes.join(', ')}.`);

// El driver Oracle usa modo thin: no necesita Instant Client.
export const oraclePool = await oracledb.createPool({
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
  poolMin: 0,
  poolMax: 4,
  queueTimeout: 5000,
  connectTimeout: 5,
});

// Las credenciales se pasan como opciones: admiten caracteres especiales.
export const mongoClient = new MongoClient(
  `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT || 27017}`,
  {
    auth: { username: process.env.MONGO_USER, password: process.env.MONGO_PASSWORD },
    authSource: 'admin',
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
  },
);
export const mongoDb = mongoClient.db(process.env.MONGO_DATABASE);
