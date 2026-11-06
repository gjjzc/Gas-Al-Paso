import { Router } from 'express';
import { autenticar, permitir } from '../middlewares/autenticacion.js';
import { exigir } from '../middlewares/validar.js';
import * as auth from '../controllers/auth.js';
import * as usuarios from '../controllers/usuarios.js';
import * as catalogo from '../controllers/catalogo.js';
import * as auditoria from '../controllers/auditoria.js';

export const apiRouter = Router();
apiRouter.post('/auth/login', auth.login);
apiRouter.post('/auth/registro', auth.registro);
apiRouter.get('/auth/me', autenticar, auth.me);
apiRouter.get('/comunas', usuarios.comunas);

// El catalogo es publico; incluir inactivos requiere ADMIN autenticado.
async function visibilidad(req, res, next) {
  exigir(req.query.incluir_inactivos === undefined || ['true', 'false'].includes(req.query.incluir_inactivos), 'incluir_inactivos debe ser true o false.');
  req.incluirInactivos = req.query.incluir_inactivos === 'true';
  if (!req.incluirInactivos) return next();
  await autenticar(req, res, () => permitir('ADMIN')(req, res, next));
}
apiRouter.get('/catalogo', visibilidad, catalogo.listar);
apiRouter.get('/catalogo/:id', visibilidad, catalogo.obtener);
apiRouter.post('/catalogo', autenticar, permitir('ADMIN'), catalogo.crear);
apiRouter.put('/catalogo/:id', autenticar, permitir('ADMIN'), catalogo.editar);
apiRouter.delete('/catalogo/:id', autenticar, permitir('ADMIN'), catalogo.eliminar);
apiRouter.patch('/productos/:id', autenticar, permitir('ADMIN'), catalogo.producto);
apiRouter.get('/usuarios', autenticar, permitir('ADMIN'), usuarios.listar);
apiRouter.post('/usuarios', autenticar, permitir('ADMIN'), usuarios.crear);
apiRouter.patch('/usuarios/:id', autenticar, permitir('ADMIN'), usuarios.editar);
apiRouter.get('/repartidores', autenticar, permitir('ADMIN'), usuarios.repartidores);
apiRouter.put('/repartidores/:id/comunas', autenticar, permitir('ADMIN'), usuarios.cobertura);
apiRouter.get('/auditoria', autenticar, permitir('ADMIN'), auditoria.listar);
apiRouter.post('/sincronizacion/reintentar', autenticar, permitir('ADMIN'), auditoria.reintentar);
