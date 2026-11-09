import { mongoDb } from '../config/databases.js';
import { siguienteId } from './contadores.js';
import { exigir } from '../middlewares/validar.js';
import { errorCampo, normalizarTelefono } from '../middlewares/validar-cliente.js';

export async function validarComuna(session, id) {
  const comuna = await mongoDb.collection('comunas').findOne({ id_comuna: id }, { session });
  if (!comuna) errorCampo('comuna', 'Selecciona una comuna existente.');
  return comuna;
}
export async function resolverDireccion(session, datos, estadoInexistente = 400) {
  let comuna;
  if (datos.nombre_comuna) comuna = await mongoDb.collection('comunas').findOne({ nombre: { $regex: `^${datos.nombre_comuna.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }, { session });
  else {
    comuna = await mongoDb.collection('comunas').findOne({ id_comuna: datos.id_comuna }, { session });
    if (!comuna && estadoInexistente === 404) exigir(false, 'Comuna no encontrada.', 404);
  }
  if (!comuna) errorCampo('comuna', 'Selecciona una comuna existente.');
  return { calle: datos.calle, numero: datos.numero, id_comuna: comuna.id_comuna, comuna: comuna.nombre, referencia: datos.referencia || '' };
}
export const principal = d => ({ calle: d.calle, numero: d.numero, comuna: d.id_comuna, referencia: d.referencia || '' });
export const direccionTexto = d => `${d.calle}${d.numero ? ` ${d.numero}` : ''}`;
export async function buscarOCrearCliente(session, datos) {
  const telefono = normalizarTelefono(datos.telefono);
  const actual = await mongoDb.collection('clientes').findOne({ telefono }, { session });
  if (actual) {
    await mongoDb.collection('clientes').updateOne({ _id: actual._id }, { $inc: { version: 1 } }, { session });
    return { cliente: actual, creado: false };
  }
  const cliente = { id_cliente: await siguienteId('id_cliente', session), nombre: datos.nombre, telefono,
    direccion_principal: datos.principal || { calle: datos.direccion_principal, numero: '', comuna: datos.id_comuna, referencia: '' }, creado_en: new Date() };
  await mongoDb.collection('clientes').insertOne(cliente, { session });
  return { cliente, creado: true };
}
export async function presentarCliente(cliente, session) {
  const d = cliente.direccion_principal;
  const comuna = await validarComuna(session, d.comuna);
  return { id_cliente: cliente.id_cliente, nombre: cliente.nombre, telefono: cliente.telefono,
    telefono_revision: 0, direccion_principal: direccionTexto(d), id_comuna: d.comuna, comuna: comuna.nombre,
    calle_principal: d.numero ? d.calle : null, numero_principal: d.numero || null, referencia_principal: d.numero ? d.referencia || null : null };
}
