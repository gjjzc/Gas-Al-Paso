import { mongoDb } from '../config/databases.js';
import { conConexion, consultar, transaccion, salidaNumero } from './oracle.js';
import { encolar, auditar, estadoSincronizacion } from './sincronizacion.js';
import { exigir } from '../middlewares/validar.js';

const columnas = 'id_producto,nombre,descripcion,peso,valor_unitario,stock,activo';
const imagenPredeterminada = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect x="55" y="45" width="90" height="120" rx="25" fill="%230B3D91"/%3E%3Cpath d="M80 45V25h40v20" fill="none" stroke="%23FF6B1A" stroke-width="10"/%3E%3C/svg%3E';
function publicar(oracle, metadata = {}) {
  const { _id, ...catalogo } = metadata;
  return { ...catalogo, id_producto: oracle.id_producto, nombre: oracle.nombre,
    descripcion: oracle.descripcion, peso: oracle.peso, precio: oracle.valor_unitario,
    stock: oracle.stock, activo: oracle.activo === 1 };
}
async function buscarOracle(c, id, bloquear = false) {
  const [producto] = await consultar(c, `SELECT ${columnas} FROM Productos WHERE id_producto=:id${bloquear ? ' FOR UPDATE' : ''}`, { id });
  exigir(producto, 'Producto no encontrado.', 404);
  return producto;
}
export async function listar({ limite, offset, categoria, incluirInactivos }) {
  const filtro = incluirInactivos ? {} : { activo: true };
  if (categoria) filtro.categoria = categoria;
  // Filtrar por el estado real de Oracle antes de paginar evita paginas incompletas.
  const oracle = await conConexion(c => consultar(c, `SELECT ${columnas} FROM Productos ${incluirInactivos ? '' : 'WHERE activo=1'}`));
  const porId = new Map(oracle.map(p => [p.id_producto, p]));
  filtro.id_producto = { $in: [...porId.keys()] };
  const metadata = await mongoDb.collection('catalogo').find(filtro).sort({ id_producto: 1 }).skip(offset).limit(limite).toArray();
  return metadata.map(m => publicar(porId.get(m.id_producto), m));
}
export async function obtener(id, incluirInactivos = false) {
  const oracle = await conConexion(c => buscarOracle(c, id));
  const metadata = await mongoDb.collection('catalogo').findOne({ id_producto: id });
  exigir(metadata && (incluirInactivos || (oracle.activo === 1 && metadata.activo)), 'Producto no encontrado.', 404);
  return publicar(oracle, metadata);
}
export async function crear(datos, usuario) {
  const { producto, eventos } = await transaccion(async c => {
    const r = await c.execute(`INSERT INTO Productos(id_producto,nombre,descripcion,peso,valor_unitario,stock,activo)
      VALUES(seq_producto.NEXTVAL,:nombre,:descripcion,:peso,:precio,:stock,:activo) RETURNING id_producto INTO :id`, {
      nombre: datos.nombre, descripcion: datos.descripcion, peso: datos.peso, precio: datos.precio,
      stock: datos.stock, activo: Number(datos.activo ?? true), id: salidaNumero(),
    });
    const id = r.outBinds.id[0];
    const metadata = { id_producto: id, nombre: datos.nombre, descripcion: datos.descripcion,
      categoria: datos.categoria, imagen: datos.imagen || imagenPredeterminada,
      atributos: datos.atributos || {}, destacado: datos.destacado ?? false, activo: datos.activo ?? true };
    const eventos = [await encolar(c, 'CATALOGO_CREAR', metadata)];
    eventos.push(await auditar(c, 'CAMBIO_PRECIO', usuario, { id_producto: id, antes: null, despues: datos.precio, creacion: true }));
    eventos.push(await auditar(c, 'CAMBIO_STOCK', usuario, { id_producto: id, antes: null, despues: datos.stock, creacion: true }));
    return { producto: publicar(await buscarOracle(c, id), metadata), eventos };
  });
  return { ...producto, sincronizacion: await estadoSincronizacion(eventos) };
}
export async function editar(id, datos, usuario, soloOracle = false) {
  let metadata;
  if (!soloOracle) {
    metadata = await mongoDb.collection('catalogo').findOne({ id_producto: id });
    exigir(metadata, 'Producto de catalogo no encontrado.', 404);
  }
  const { producto, eventos } = await transaccion(async c => {
    const actual = await buscarOracle(c, id, true);
    const cambios = {};
    const mapa = { nombre: 'nombre', descripcion: 'descripcion', peso: 'peso', precio: 'valor_unitario', stock: 'stock', activo: 'activo' };
    const presentes = Object.keys(mapa).filter(k => Object.hasOwn(datos, k));
    if (presentes.length) {
      await c.execute(`UPDATE Productos SET ${presentes.map(k => `${mapa[k]}=:${k}`).join(',')} WHERE id_producto=:id`,
        Object.fromEntries([['id', id], ...presentes.map(k => [k, k === 'activo' ? Number(datos[k]) : datos[k]])]));
    }
    const eventos = [];
    for (const k of ['nombre', 'descripcion', 'categoria', 'imagen', 'atributos', 'destacado', 'activo']) {
      if (Object.hasOwn(datos, k)) cambios[k] = datos[k];
    }
    if (Object.keys(cambios).length) eventos.push(await encolar(c, 'CATALOGO_EDITAR',
      { id_producto: id, cambios, permitir_ausente: soloOracle }));
    if (Object.hasOwn(datos, 'precio') && datos.precio !== actual.valor_unitario) {
      eventos.push(await auditar(c, 'CAMBIO_PRECIO', usuario, { id_producto: id, antes: actual.valor_unitario, despues: datos.precio }));
    }
    if (Object.hasOwn(datos, 'stock') && datos.stock !== actual.stock) {
      eventos.push(await auditar(c, 'CAMBIO_STOCK', usuario, { id_producto: id, antes: actual.stock, despues: datos.stock }));
    }
    if (Object.keys(cambios).length) eventos.push(await auditar(c, 'EDICION_CATALOGO', usuario, { id_producto: id, campos: Object.keys(cambios) }));
    return { producto: publicar(await buscarOracle(c, id), { ...metadata, ...cambios }), eventos };
  });
  return { ...producto, sincronizacion: await estadoSincronizacion(eventos) };
}
export async function eliminar(id, usuario) {
  await obtener(id, true);
  const resultado = await editar(id, { activo: false }, usuario);
  return { mensaje: 'Producto desactivado. Se conservan las ventas historicas.',
    id_producto: id, sincronizacion: resultado.sincronizacion };
}
