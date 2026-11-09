import { verificarBases } from '../services/health.js';

export async function obtenerHealth(req, res, next) {
  try {
    const resultado = await verificarBases();
    res.status(resultado.estado === 'OK' ? 200 : 503).json({
      ...resultado,
      mensaje: resultado.estado === 'OK'
        ? 'MongoDB y Redis disponibles.'
        : 'Una o más bases de datos no están disponibles.',
    });
  } catch (error) {
    next(error);
  }
}
