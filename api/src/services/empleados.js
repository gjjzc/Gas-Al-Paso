import { mongoDb } from '../config/databases.js';
import { exigir } from '../middlewares/validar.js';
export async function repartidorActivo(session, id) {
  const e = await mongoDb.collection('empleados').findOne({ id_empleado: id, rol: 'REPARTIDOR', activo: true }, { session });
  const u = e && await mongoDb.collection('usuarios').findOne({ id_empleado: id, rol: 'REPARTIDOR', activo: true }, { session });
  exigir(u, 'Repartidor activo no encontrado.', 404);
  return { id_empleado: e.id_empleado, nombre: e.nombre };
}
