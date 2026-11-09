import { mongoDb } from '../config/databases.js';
import { exigir } from '../middlewares/validar.js';
export const fechaActual = () => new Date().toISOString().slice(0, 10);
export const rangoDia = fecha => ({ $gte: new Date(`${fecha}T00:00:00.000Z`), $lt: new Date(new Date(`${fecha}T00:00:00.000Z`).getTime() + 86400000) });
export async function asegurarDiaAbierto(session, empleado, fecha = fechaActual()) {
  // Escritura común a cierre, carga, venta, asignación y entrega: evita carreras entre ellas.
  const r = await mongoDb.collection('empleados').updateOne({ id_empleado: empleado }, { $inc: { version_actividad: 1 } }, { session });
  exigir(r.matchedCount, 'Empleado no encontrado.', 404);
  exigir(!await mongoDb.collection('cierres_caja').findOne({ id_empleado: empleado, fecha }, { session }),
    'El repartidor ya tiene un cierre para esa fecha. No se permite nueva actividad del dia.', 409);
  return fecha;
}
