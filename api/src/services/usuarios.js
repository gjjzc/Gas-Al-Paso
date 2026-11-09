import bcrypt from 'bcrypt';
import { mongoDb } from '../config/databases.js';
import { siguienteId } from './contadores.js';
import { transaccion } from './transacciones.js';
import { auditar } from './auditoria.js';
import { buscarOCrearCliente, validarComuna, direccionTexto } from './clientes.js';
import { exigir } from '../middlewares/validar.js';
import { errorCampo } from '../middlewares/validar-cliente.js';

export function usuarioPublico(usuario) {
  const { _id, password_hash, token_version, ...publico } = usuario;
  return { ...publico, activo: usuario.activo === true };
}
export async function buscarUsuario(id, session) {
  const u = await mongoDb.collection('usuarios').findOne({ id_usuario: id }, { session });
  if (!u) return null;
  const e = u.id_empleado ? await mongoDb.collection('empleados').findOne({ id_empleado: u.id_empleado }, { session }) : null;
  const c = u.id_cliente ? await mongoDb.collection('clientes').findOne({ id_cliente: u.id_cliente }, { session }) : null;
  return { id_usuario: u.id_usuario, email: u.email, rol: u.rol, activo: u.activo, id_empleado: u.id_empleado,
    id_cliente: u.id_cliente, token_version: u.token_version, nombre: e?.nombre || c?.nombre || null,
    telefono: c?.telefono || null, direccion_principal: c ? direccionTexto(c.direccion_principal) : null,
    id_comuna: c?.direccion_principal.comuna || null, telefono_revision: c ? 0 : null };
}
export const buscarLogin = email => mongoDb.collection('usuarios').findOne({ email });
async function coordinar(session) {
  // Equivale a serializar las altas y la protección del último administrador.
  await siguienteId('coordinacion_usuarios', session);
}
async function comprobarComunas(session, ids) { for (const id of ids) await validarComuna(session, id); }
export async function crearUsuario(datos, actor) {
  const hash = await bcrypt.hash(datos.password, 12);
  return transaccion(async session => {
    await coordinar(session);
    let id_cliente = null, id_empleado = null, vinculado = false;
    if (datos.rol === 'CLIENTE') {
      await validarComuna(session, datos.id_comuna);
      const r = await buscarOCrearCliente(session, datos);
      id_cliente = r.cliente.id_cliente; vinculado = !r.creado;
      if (await mongoDb.collection('usuarios').findOne({ id_cliente }, { session })) errorCampo('telefono', 'Este teléfono ya tiene una cuenta. Inicia sesión con esa cuenta.', 409);
      const misma = direccionTexto(r.cliente.direccion_principal) === datos.direccion_principal && r.cliente.direccion_principal.comuna === datos.id_comuna;
      await mongoDb.collection('clientes').updateOne({ id_cliente }, { $set: {
        nombre: datos.nombre, direccion_principal: misma ? r.cliente.direccion_principal : { calle: datos.direccion_principal, numero: '', comuna: datos.id_comuna, referencia: '' },
      } }, { session });
    } else {
      await comprobarComunas(session, datos.comunas || []);
      id_empleado = await siguienteId('id_empleado', session);
      await mongoDb.collection('empleados').insertOne({ id_empleado, nombre: datos.nombre, rol: datos.rol, activo: datos.activo !== false, comunas: datos.comunas || [] }, { session });
    }
    const id_usuario = await siguienteId('id_usuario', session);
    await mongoDb.collection('usuarios').insertOne({ id_usuario, email: datos.email, password_hash: hash,
      rol: datos.rol, activo: datos.activo !== false, id_empleado, id_cliente, token_version: 0 }, { session });
    const salida = usuarioPublico(await buscarUsuario(id_usuario, session));
    if (vinculado) await auditar(session, 'CLIENTE_VINCULADO_USUARIO', actor || salida, { id_cliente, id_usuario });
    return salida;
  });
}
export async function editarUsuario(id, datos) {
  const hash = datos.password ? await bcrypt.hash(datos.password, 12) : null;
  return transaccion(async session => {
    await coordinar(session);
    const actual = await buscarUsuario(id, session);
    exigir(actual, 'Usuario no encontrado.', 404);
    const rol = datos.rol || actual.rol;
    exigir((rol === 'CLIENTE') === (actual.rol === 'CLIENTE'), 'No se puede convertir un cliente en empleado ni al reves.', 409);
    if (actual.rol === 'ADMIN' && actual.activo && (rol !== 'ADMIN' || datos.activo === false)) {
      exigir(await mongoDb.collection('usuarios').countDocuments({ rol: 'ADMIN', activo: true }, { session }) > 1,
        'No puedes desactivar ni cambiar el rol del ultimo administrador activo.', 409);
    }
    const cambios = {};
    for (const k of ['email', 'rol', 'activo']) if (datos[k] !== undefined) cambios[k] = datos[k];
    if (hash) cambios.password_hash = hash;
    const update = { $set: cambios };
    if (hash || datos.rol !== undefined || datos.activo !== undefined) update.$inc = { token_version: 1 };
    if (Object.keys(cambios).length) await mongoDb.collection('usuarios').updateOne({ id_usuario: id }, update, { session });
    if (actual.id_cliente) {
      const cliente = await mongoDb.collection('clientes').findOne({ id_cliente: actual.id_cliente }, { session });
      const valores = {};
      for (const k of ['nombre', 'telefono']) if (datos[k] !== undefined) valores[k] = datos[k];
      if (datos.direccion_principal !== undefined || datos.id_comuna !== undefined) {
        const comuna = datos.id_comuna || cliente.direccion_principal.comuna;
        await validarComuna(session, comuna);
        const texto = datos.direccion_principal ?? direccionTexto(cliente.direccion_principal);
        if (texto !== direccionTexto(cliente.direccion_principal) || comuna !== cliente.direccion_principal.comuna) valores.direccion_principal = { calle: texto, numero: '', comuna, referencia: '' };
      }
      await mongoDb.collection('clientes').updateOne({ _id: cliente._id }, { $set: valores, $inc: { version: 1 } }, { session });
    } else {
      exigir(!['telefono', 'direccion_principal', 'id_comuna'].some(k => datos[k] !== undefined), 'Los datos de domicilio solo corresponden a clientes.');
      const empleado = { rol };
      if (datos.nombre) empleado.nombre = datos.nombre;
      if (datos.activo !== undefined) empleado.activo = datos.activo;
      if (rol === 'ADMIN') empleado.comunas = [];
      await mongoDb.collection('empleados').updateOne({ id_empleado: actual.id_empleado }, { $set: empleado, $inc: { version_actividad: 1 } }, { session });
    }
    return usuarioPublico(await buscarUsuario(id, session));
  });
}
export async function listarUsuarios({ limite, offset, rol, activo, buscar = '' }) {
  const docs = await mongoDb.collection('usuarios').find({ ...(rol ? { rol } : {}), ...(activo !== undefined ? { activo } : {}) }).sort({ id_usuario: 1 }).toArray();
  const filas = [];
  for (const d of docs) {
    const u = usuarioPublico(await buscarUsuario(d.id_usuario));
    if (`${u.nombre} ${u.email}`.toLowerCase().includes(buscar.toLowerCase())) filas.push(u);
  }
  return filas.slice(offset, offset + limite);
}
export const comunas = () => mongoDb.collection('comunas').find({}, { projection: { _id: 0 } }).sort({ nombre: 1 }).toArray();
export async function repartidores(comuna) {
  const empleados = await mongoDb.collection('empleados').find({ rol: 'REPARTIDOR', activo: true }).toArray();
  const filas = [];
  for (const e of empleados) {
    const u = await mongoDb.collection('usuarios').findOne({ id_empleado: e.id_empleado, rol: 'REPARTIDOR', activo: true });
    if (!u) continue;
    const cobertura = await mongoDb.collection('comunas').find({ id_comuna: { $in: e.comunas } }, { projection: { _id: 0 } }).sort({ nombre: 1 }).toArray();
    filas.push({ id_empleado: e.id_empleado, nombre: e.nombre, id_usuario: u.id_usuario, cubre_comuna: e.comunas.includes(comuna), comunas: cobertura });
  }
  return filas.sort((a, b) => Number(b.cubre_comuna) - Number(a.cubre_comuna) || a.nombre.localeCompare(b.nombre));
}
export async function asignarComunas(empleado, ids) {
  return transaccion(async session => {
    await comprobarComunas(session, ids);
    const u = await mongoDb.collection('usuarios').findOne({ id_empleado: empleado, rol: 'REPARTIDOR', activo: true }, { session });
    exigir(u, 'Repartidor activo no encontrado.', 404);
    await mongoDb.collection('empleados').updateOne({ id_empleado: empleado }, { $set: { comunas: ids }, $inc: { version_actividad: 1 } }, { session });
    return { id_empleado: empleado, comunas: ids };
  });
}
