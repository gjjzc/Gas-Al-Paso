import { campos, entero, exigir, texto, idRuta } from '../middlewares/validar.js';
import { fechaDia, claveIdempotencia } from '../middlewares/validar-ventas.js';
import { dinero, cantidades } from '../middlewares/validar-control.js';
import * as servicio from '../services/control.js';

export async function cargar(req, res) {
  campos(req.body, ['id_empleado','fecha','items'], ['id_empleado','items']);
  const items = cantidades(req.body.items, 'cantidad_cargada', 1);
  exigir(items.length > 0, 'Debes indicar al menos un producto para cargar.');
  const r = await servicio.cargar(req.usuario, { id_empleado: entero(req.body.id_empleado, 'id_empleado'),
    fecha: fechaDia(req.body.fecha), items }, claveIdempotencia(req.get('Idempotency-Key')));
  res.status(r.reutilizada ? 200 : 201).json(r);
}
export async function cargas(req, res) {
  res.json(await servicio.listarCargas({ fecha: fechaDia(req.query.fecha),
    id_empleado: req.query.id_empleado === undefined ? undefined : idRuta(req.query.id_empleado) }));
}
export async function cerrar(req, res) {
  campos(req.body, ['fecha','entregado_efectivo','entregado_transferencia','devueltos','observacion'],
    ['entregado_efectivo','entregado_transferencia','devueltos']);
  const r = await servicio.cerrar(req.usuario, { fecha: fechaDia(req.body.fecha),
    entregado_efectivo: dinero(req.body.entregado_efectivo, 'entregado_efectivo'),
    entregado_transferencia: dinero(req.body.entregado_transferencia, 'entregado_transferencia'),
    devueltos: cantidades(req.body.devueltos, 'devuelto'),
    observacion: req.body.observacion === undefined ? '' : texto(req.body.observacion, 'observacion', 500, 0),
  }, claveIdempotencia(req.get('Idempotency-Key')));
  res.status(r.reutilizada ? 200 : 201).json(r);
}
export async function cuadratura(req, res) {
  res.json(await servicio.cuadratura({ fecha: fechaDia(req.query.fecha),
    id_empleado: req.query.id_empleado === undefined ? undefined : idRuta(req.query.id_empleado) }));
}

export async function propio(req, res) {
  exigir(Object.keys(req.query).every(k => k === 'fecha'), 'Solo se admite el filtro fecha.');
  res.json(await servicio.cierrePropio(req.usuario, fechaDia(req.query.fecha)));
}
