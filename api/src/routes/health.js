import { Router } from 'express';
import { obtenerHealth } from '../controllers/health.js';

export const healthRouter = Router();
healthRouter.get('/health', obtenerHealth);
