import { Router } from 'express';
import { autenticar, permitir } from '../middlewares/autenticacion.js';
import { exigir } from '../middlewares/validar.js';
import * as auth from '../controllers/auth.js';
import * as usuarios from '../controllers/usuarios.js';
import * as catalogo from '../controllers/catalogo.js';
import * as auditoria from '../controllers/auditoria.js';
import * as carrito from '../controllers/carrito.js';
import * as ventas from '../controllers/ventas.js';
import * as control from '../controllers/control.js';

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

// Carrito privado por cliente. El TTL se renueva solo al modificarlo.
apiRouter.get('/carrito', autenticar, permitir('CLIENTE'), carrito.obtener);
apiRouter.post('/carrito/items', autenticar, permitir('CLIENTE'), carrito.agregar);
apiRouter.patch('/carrito/items/:idProducto', autenticar, permitir('CLIENTE'), carrito.cambiar);
apiRouter.delete('/carrito/items/:idProducto', autenticar, permitir('CLIENTE'), carrito.quitar);
apiRouter.delete('/carrito', autenticar, permitir('CLIENTE'), carrito.vaciar);
apiRouter.post('/pedidos', autenticar, permitir('CLIENTE'), ventas.confirmar);
apiRouter.post('/pedidos/telefonico', autenticar, permitir('ADMIN'), ventas.telefonico);
// Rutas fijas antes de /pedidos/:id para evitar interpretar 'mios' como ObjectId.
apiRouter.get('/pedidos/mios', autenticar, permitir('CLIENTE'), ventas.listarPedidos);
apiRouter.get('/pedidos/asignados', autenticar, permitir('REPARTIDOR'), ventas.listarPedidos);
apiRouter.get('/pedidos', autenticar, permitir('ADMIN'), ventas.listarPedidos);
apiRouter.get('/pedidos/:id', autenticar, ventas.obtenerPedido);
apiRouter.patch('/pedidos/:id/asignar', autenticar, permitir('ADMIN'), ventas.asignar);
apiRouter.patch('/pedidos/:id/estado', autenticar, permitir('ADMIN', 'REPARTIDOR'), ventas.estado);
apiRouter.patch('/pedidos/:id/cancelar', autenticar, permitir('ADMIN', 'CLIENTE'), ventas.cancelar);
apiRouter.delete('/pedidos/:id', autenticar, permitir('ADMIN'), ventas.eliminar);
apiRouter.post('/ventas/calle', autenticar, permitir('REPARTIDOR'), ventas.calle);
apiRouter.get('/ventas/dia', autenticar, permitir('ADMIN', 'REPARTIDOR'), ventas.dia);

apiRouter.post('/cargas', autenticar, permitir('ADMIN'), control.cargar);
apiRouter.get('/cargas', autenticar, permitir('ADMIN'), control.cargas);
apiRouter.post('/cierre', autenticar, permitir('REPARTIDOR'), control.cerrar);
apiRouter.get('/cuadratura', autenticar, permitir('ADMIN'), control.cuadratura);
