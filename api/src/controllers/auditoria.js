import { mongoDb, conectarMongo } from '../config/databases.js';
import { paginacion, texto, idRuta } from '../middlewares/validar.js';
import { fechaDia } from '../middlewares/validar-ventas.js';
import { procesarPendientes } from '../services/sincronizacion.js';
import { conConexion, consultar } from '../services/oracle.js';

export async function listar(req, res) {
  const { limite, offset } = paginacion(req.query);
  const filtro = {};
  if (req.query.tipo !== undefined) filtro.tipo = texto(req.query.tipo, 'tipo', 40);
  if (req.query.id_usuario !== undefined) filtro['usuario.id'] = idRuta(req.query.id_usuario);
  if (req.query.id_empleado !== undefined) filtro['detalle.id_empleado'] = idRuta(req.query.id_empleado);
  const fecha = fechaDia(req.query.fecha);
  if (fecha) filtro.fecha = { $gte: new Date(`${fecha}T00:00:00.000Z`), $lt: new Date(new Date(`${fecha}T00:00:00.000Z`).getTime()+86400000) };
  await conectarMongo();
  res.json(await mongoDb.collection('eventos_auditoria').find(filtro).sort({ fecha: -1, _id: -1 }).skip(offset).limit(limite).toArray());
}
export async function reintentar(req, res) {
  await procesarPendientes();
  const [r] = await conConexion(c => consultar(c, "SELECT COUNT(*) pendientes FROM Pendiente_Mongo WHERE estado='PENDIENTE'"));
  res.json({ mensaje: 'Reintento ejecutado.', pendientes: r.pendientes });
}
