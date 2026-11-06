import { campos, entero, idRuta, paginacion, texto, exigir } from '../middlewares/validar.js';
import { metodoPago, direccion, lineas, idPedido, claveIdempotencia, fechaDia, estadosPedido } from '../middlewares/validar-ventas.js';
import { crearVenta, ventasDia } from '../services/ventas.js';
import * as pedidos from '../services/pedidos.js';

export async function confirmar(req, res) {
  campos(req.body, ['direccion_entrega', 'metodo_cobro'], ['direccion_entrega', 'metodo_cobro']);
  const resultado = await crearVenta(req.usuario, 'WEB', { direccion_entrega: direccion(req.body.direccion_entrega),
    metodo_cobro: metodoPago(req.body.metodo_cobro) }, claveIdempotencia(req.get('Idempotency-Key')));
  res.status(resultado.reutilizada ? 200 : 201).json(resultado);
}
export async function telefonico(req, res) {
  campos(req.body, ['id_cliente', 'direccion_entrega', 'metodo_cobro', 'items'], ['id_cliente', 'direccion_entrega', 'metodo_cobro', 'items']);
  const resultado = await crearVenta(req.usuario, 'LLAMADA', { id_cliente: entero(req.body.id_cliente, 'id_cliente'),
    direccion_entrega: direccion(req.body.direccion_entrega), metodo_cobro: metodoPago(req.body.metodo_cobro), items: lineas(req.body.items) },
    claveIdempotencia(req.get('Idempotency-Key')));
  res.status(resultado.reutilizada ? 200 : 201).json(resultado);
}
export async function calle(req, res) {
  campos(req.body, ['items', 'metodo_pago'], ['items', 'metodo_pago']);
  const resultado = await crearVenta(req.usuario, 'TARREO', { items: lineas(req.body.items), metodo_pago: metodoPago(req.body.metodo_pago) },
    claveIdempotencia(req.get('Idempotency-Key')));
  res.status(resultado.reutilizada ? 200 : 201).json(resultado);
}
export async function listarPedidos(req, res) {
  const { estado, fecha, comuna } = req.query;
  exigir(estado === undefined || estadosPedido.includes(estado), 'Estado de pedido invalido.');
  res.json(await pedidos.listar(req.usuario, { ...paginacion(req.query), estado, fecha: fechaDia(fecha),
    comuna: comuna === undefined ? undefined : texto(comuna, 'comuna', 80) }));
}
export async function obtenerPedido(req, res) { res.json(await pedidos.obtener(req.usuario, idPedido(req.params.id))); }
export async function asignar(req, res) {
  campos(req.body, ['id_empleado'], ['id_empleado']);
  res.json(await pedidos.asignar(req.usuario, idPedido(req.params.id), entero(req.body.id_empleado, 'id_empleado')));
}
export async function estado(req, res) {
  campos(req.body, ['estado', 'metodo_pago'], ['estado']);
  exigir(['EN_CAMINO', 'ENTREGADO'].includes(req.body.estado), 'Usa estado EN_CAMINO o ENTREGADO; asignacion y cancelacion tienen sus propias rutas.');
  let metodo;
  if (req.body.estado === 'ENTREGADO') metodo = metodoPago(req.body.metodo_pago);
  else exigir(req.body.metodo_pago === undefined, 'El metodo_pago se registra al entregar.');
  res.json(await pedidos.cambiarEstado(req.usuario, idPedido(req.params.id), req.body.estado, metodo));
}
export async function cancelar(req, res) { res.json(await pedidos.cancelar(req.usuario, idPedido(req.params.id))); }
export async function eliminar(req, res) { res.json(await pedidos.eliminar(req.usuario, idPedido(req.params.id))); }
export async function dia(req, res) {
  const { canal, estado_pago } = req.query;
  exigir(canal === undefined || ['WEB', 'LLAMADA', 'TARREO'].includes(canal), 'Canal invalido.');
  exigir(estado_pago === undefined || ['PENDIENTE', 'COBRADA', 'ANULADA'].includes(estado_pago), 'Estado de pago invalido.');
  res.json(await ventasDia(req.usuario, { ...paginacion(req.query), canal, estado_pago, fecha: fechaDia(req.query.fecha),
    id_empleado: req.query.id_empleado === undefined ? undefined : idRuta(req.query.id_empleado) }));
}
