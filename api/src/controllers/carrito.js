import { campos, entero, idRuta } from '../middlewares/validar.js';
import * as servicio from '../services/carrito.js';

export async function obtener(req, res) { res.json(await servicio.obtener(req.usuario.id_cliente)); }
export async function agregar(req, res) {
  campos(req.body, ['id_producto', 'cantidad'], ['id_producto', 'cantidad']);
  res.json(await servicio.modificar(req.usuario, 'AGREGAR', entero(req.body.id_producto, 'id_producto'), entero(req.body.cantidad, 'cantidad', 1, 9999)));
}
export async function cambiar(req, res) {
  campos(req.body, ['cantidad'], ['cantidad']);
  res.json(await servicio.modificar(req.usuario, 'CAMBIAR', idRuta(req.params.idProducto), entero(req.body.cantidad, 'cantidad', 1, 9999)));
}
export async function quitar(req, res) { res.json(await servicio.modificar(req.usuario, 'QUITAR', idRuta(req.params.idProducto))); }
export async function vaciar(req, res) { res.json(await servicio.modificar(req.usuario, 'VACIAR')); }
