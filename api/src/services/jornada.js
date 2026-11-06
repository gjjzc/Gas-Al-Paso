import { consultar } from './oracle.js';
import { exigir } from '../middlewares/validar.js';

export async function fechaActual(c) {
  const [r] = await consultar(c, "SELECT TO_CHAR(SYSDATE,'YYYY-MM-DD') fecha FROM DUAL");
  return r.fecha;
}
export async function asegurarDiaAbierto(c, empleado, fecha) {
  const [fila] = await consultar(c, 'SELECT id_empleado FROM Empleado WHERE id_empleado=:id FOR UPDATE', { id: empleado });
  exigir(fila, 'Empleado no encontrado.', 404);
  const dia = fecha || await fechaActual(c);
  const [cierre] = await consultar(c, "SELECT id_cierre FROM Cierre_caja WHERE id_empleado=:id AND fecha=TO_DATE(:fecha,'YYYY-MM-DD')", { id: empleado, fecha: dia });
  exigir(!cierre, 'El repartidor ya tiene un cierre para esa fecha. No se permite nueva actividad del dia.', 409);
  return dia;
}
