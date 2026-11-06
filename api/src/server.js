import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { manejarErrores } from './middlewares/errores.js';
import { oraclePool, mongoClient } from './config/databases.js';

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', healthRouter);
app.use((req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada.' }));
app.use(manejarErrores);

const server = app.listen(process.env.PORT || 4000, '0.0.0.0', () => {
  console.log('API Gas al Paso iniciada.');
});

async function cerrar() {
  server.close(async () => {
    await Promise.allSettled([oraclePool.close(0), mongoClient.close()]);
    process.exit(0);
  });
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
