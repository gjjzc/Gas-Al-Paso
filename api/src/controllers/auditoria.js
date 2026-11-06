import { mongoDb, conectarMongo } from '../config/databases.js';
import { paginacion, texto } from '../middlewares/validar.js';
import { procesarPendientes } from '../services/sincronizacion.js';
import { conConexion, consultar } from '../services/oracle.js';

export async function listar(req, res) {
  const { limite, offset } = paginacion(req.query);
  const filtro = {};
  if (req.query.tipo !== undefined) filtro.tipo = texto(req.query.tipo, 'tipo', 40);
  await conectarMongo();
  res.json(await mongoDb.collection('eventos_auditoria').find(filtro).sort({ fecha: -1, _id: -1 }).skip(offset).limit(limite).toArray());
}
export async function reintentar(req, res) {
  await procesarPendientes();
  const [r] = await conConexion(c => consultar(c, "SELECT COUNT(*) pendientes FROM Pendiente_Mongo WHERE estado='PENDIENTE'"));
  res.json({ mensaje: 'Reintento ejecutado.', pendientes: r.pendientes });
}
