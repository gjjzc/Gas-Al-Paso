import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/api.js';
import { manejarErrores } from './middlewares/errores.js';

export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', healthRouter, apiRouter);
app.use((req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada.' }));
app.use(manejarErrores);
