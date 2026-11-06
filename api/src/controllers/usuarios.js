import { campos, texto, correo, password, entero, booleano, listaComunas, paginacion, idRuta, exigir } from '../middlewares/validar.js';
import * as servicio from '../services/usuarios.js';

const roles = ['CLIENTE', 'REPARTIDOR', 'ADMIN'];
export function validarAlta(cuerpo, registro = false) {
  const basicos = ['email', 'password', 'nombre', 'telefono', 'direccion_principal', 'id_comuna'];
  campos(cuerpo, registro ? basicos : [...basicos, 'rol', 'activo', 'comunas'],
    registro ? basicos : ['email', 'password', 'nombre', 'rol']);
  const rol = registro ? 'CLIENTE' : cuerpo.rol;
  exigir(roles.includes(rol), 'Rol invalido.');
  const datos = { email: correo(cuerpo.email), password: password(cuerpo.password), nombre: texto(cuerpo.nombre, 'nombre', 80), rol };
  if (Object.hasOwn(cuerpo, 'activo')) datos.activo = booleano(cuerpo.activo, 'activo');
  if (rol === 'CLIENTE') {
    datos.telefono = texto(cuerpo.telefono, 'telefono', 20);
    datos.direccion_principal = texto(cuerpo.direccion_principal, 'direccion_principal', 200);
    datos.id_comuna = entero(cuerpo.id_comuna, 'id_comuna');
    exigir(!Object.hasOwn(cuerpo, 'comunas'), 'Un cliente tiene id_comuna, no cobertura de reparto.');
  } else {
    exigir(!['telefono', 'direccion_principal', 'id_comuna'].some(k => Object.hasOwn(cuerpo, k)), 'Los datos de domicilio son para clientes.');
    if (Object.hasOwn(cuerpo, 'comunas')) {
      exigir(rol === 'REPARTIDOR', 'Solo un repartidor puede tener cobertura.');
      datos.comunas = listaComunas(cuerpo.comunas);
    }
  }
  return datos;
}
export async function listar(req, res) { res.json(await servicio.listarUsuarios(paginacion(req.query))); }
export async function crear(req, res) { res.status(201).json(await servicio.crearUsuario(validarAlta(req.body))); }
export async function editar(req, res) {
  campos(req.body, ['email', 'password', 'nombre', 'rol', 'activo', 'telefono', 'direccion_principal', 'id_comuna']);
  exigir(Object.keys(req.body).length > 0, 'Debes indicar al menos un cambio.');
  const datos = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (k === 'email') datos[k] = correo(v);
    if (k === 'password') datos[k] = password(v);
    if (k === 'nombre') datos[k] = texto(v, k, 80);
    if (k === 'telefono') datos[k] = texto(v, k, 20);
    if (k === 'direccion_principal') datos[k] = texto(v, k, 200);
    if (k === 'id_comuna') datos[k] = entero(v, k);
    if (k === 'activo') datos[k] = booleano(v, k);
    if (k === 'rol') { exigir(roles.includes(v), 'Rol invalido.'); datos[k] = v; }
  }
  res.json(await servicio.editarUsuario(idRuta(req.params.id), datos));
}
export async function comunas(req, res) { res.json(await servicio.comunas()); }
export async function repartidores(req, res) {
  res.json(await servicio.repartidores(req.query.comuna === undefined ? null : idRuta(req.query.comuna)));
}
export async function cobertura(req, res) {
  campos(req.body, ['comunas'], ['comunas']);
  res.json(await servicio.asignarComunas(idRuta(req.params.id), listaComunas(req.body.comunas)));
}
