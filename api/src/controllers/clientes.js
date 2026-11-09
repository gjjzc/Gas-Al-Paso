import {
  campos,
  idRuta,
  exigir,
  texto,
  entero,
} from '../middlewares/validar.js';
import { errorCampo, nombreCliente } from '../middlewares/validar-cliente.js';
import { direccionTelefonica } from '../middlewares/validar-telefonico.js';
import * as clientes from '../services/fichas-clientes.js';
export function telefonoParcial(valor) {
  if (
    typeof valor !== 'string' ||
    valor.length > 40 ||
    !/^[+\d\s().-]+$/.test(valor)
  )
    errorCampo('telefono', 'Escribe al menos 4 dígitos del teléfono.');
  let n = valor.replace(/\D/g, '');
  if (n.length === 13 && n.startsWith('0056')) n = n.slice(4);
  else if (
    (n.length === 11 && n.startsWith('56')) ||
    valor.trim().startsWith('+56')
  )
    n = n.slice(2);
  if (n.length < 4 || n.length > 9)
    errorCampo(
      'telefono',
      'La búsqueda requiere entre 4 y 9 dígitos, sin contar +56.',
    );
  return n;
}
export async function buscar(req, res) {
  exigir(
    Object.keys(req.query).every((k) => k === 'telefono'),
    'Solo se admite el filtro telefono.',
  );
  res.json(await clientes.buscar(telefonoParcial(req.query.telefono)));
}
export async function obtener(req, res) {
  res.json(await clientes.obtener(idRuta(req.params.id)));
}
export async function editar(req, res) {
  campos(req.body, ['nombre', 'direccion_principal', 'id_comuna']);
  exigir(Object.keys(req.body).length > 0, 'Indica al menos un cambio.');
  const datos = {};
  if (req.body.nombre !== undefined)
    datos.nombre = nombreCliente(req.body.nombre);
  if (req.body.direccion_principal !== undefined) {
    if (typeof req.body.direccion_principal === 'string') {
      try {
        datos.direccion_principal = texto(
          req.body.direccion_principal,
          'direccion_principal',
          200,
        );
      } catch {
        errorCampo(
          'direccion_principal',
          'La dirección principal debe tener entre 1 y 200 caracteres.',
        );
      }
    } else {
      exigir(
        req.body.id_comuna === undefined,
        'Incluye la comuna dentro de la dirección estructurada.',
      );
      datos.direccion = direccionTelefonica(req.body.direccion_principal);
    }
  }
  if (req.body.id_comuna !== undefined)
    datos.id_comuna = entero(req.body.id_comuna, 'id_comuna');
  res.json(await clientes.editar(idRuta(req.params.id), datos, req.usuario));
}
