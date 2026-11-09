import bcrypt from 'bcrypt';
import { consultar, conConexion, transaccion, salidaNumero } from './oracle.js';
import { buscarOCrearCliente, validarComuna, exigirContactoRevisado } from './clientes.js';
import { errorCampo } from '../middlewares/validar-cliente.js';
import { auditar, estadoSincronizacion } from './sincronizacion.js';
import { exigir } from '../middlewares/validar.js';

const seleccion = `SELECT u.id_usuario,u.email,u.rol,u.activo,u.id_empleado,u.id_cliente,u.token_version,
    COALESCE(e.nombre,c.nombre) nombre,c.telefono,c.direccion_principal,c.id_comuna,c.telefono_revision
    FROM Usuario u LEFT JOIN Empleado e ON e.id_empleado=u.id_empleado
    LEFT JOIN Cliente c ON c.id_cliente=u.id_cliente`;
export function usuarioPublico(usuario) {
  const { password_hash, token_version, ...publico } = usuario;
  return { ...publico, activo: usuario.activo === 1 };
}
export async function buscarUsuario(id, conexion) {
  const buscar = async c => (await consultar(c, `${seleccion} WHERE u.id_usuario=:id`, { id }))[0];
  return conexion ? buscar(conexion) : conConexion(buscar);
}
export async function buscarLogin(email) {
  return conConexion(async c => (await consultar(c,
    'SELECT id_usuario,email,password_hash,rol,activo,token_version FROM Usuario WHERE email=:email', { email }))[0]);
}
export async function listarUsuarios({ limite, offset, rol, activo, buscar = '' }) {
  return conConexion(async c => (await consultar(c, `${seleccion} WHERE (:rol IS NULL OR u.rol=:rol) AND (:activo IS NULL OR u.activo=:activo)
    AND (:buscar IS NULL OR INSTR(LOWER(COALESCE(e.nombre,c.nombre)||' '||u.email),:buscar)>0)
    ORDER BY u.id_usuario OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
    { limite, offset, rol: rol || null, activo: activo === undefined ? null : Number(activo), buscar: buscar.toLowerCase() || null })).map(usuarioPublico));
}
async function cambiarComunas(c, empleado, comunas) {
  await c.execute('DELETE FROM Repartidor_Comuna WHERE id_empleado=:id', { id: empleado });
  for (const id of comunas) {
    await c.execute('INSERT INTO Repartidor_Comuna(id_empleado,id_comuna) VALUES(:empleado,:id)', { empleado, id });
  }
}
export async function crearUsuario(datos, actor) {
  const hash = await bcrypt.hash(datos.password, 12);
  const resultado = await transaccion(async c => {
    // Mismo orden de bloqueo que editarUsuario; evita altas dobles y cambios de acceso concurrentes.
    await c.execute('LOCK TABLE Usuario IN EXCLUSIVE MODE');
    let creado = true;
    let empleado = null;
    let cliente = null;
    if (datos.rol === 'CLIENTE') {
      await validarComuna(c, datos.id_comuna);
      const encontrado = await buscarOCrearCliente(c, datos);
      creado = encontrado.creado;
      exigirContactoRevisado(encontrado.cliente);
      cliente = encontrado.cliente.id_cliente;
      const [vinculado] = await consultar(c, 'SELECT id_usuario FROM Usuario WHERE id_cliente=:id', { id: cliente });
      if(vinculado) errorCampo('telefono','Este teléfono ya tiene una cuenta. Inicia sesión con esa cuenta.',409);
      if(!creado) {
        if(encontrado.cliente.direccion_principal!==datos.direccion_principal || encontrado.cliente.id_comuna!==datos.id_comuna)
          await c.execute('UPDATE Cliente SET calle_principal=NULL,numero_principal=NULL,referencia_principal=NULL WHERE id_cliente=:id',{id:cliente});
        await c.execute(`UPDATE Cliente SET nombre=:nombre,direccion_principal=:direccion,id_comuna=:comuna
          WHERE id_cliente=:id`, { nombre:datos.nombre,direccion:datos.direccion_principal,comuna:datos.id_comuna,id:cliente });
      }
    } else {
      const r = await c.execute(`INSERT INTO Empleado(id_empleado,nombre,id_tienda)
        VALUES(seq_empleado.NEXTVAL,:nombre,1) RETURNING id_empleado INTO :id`, { nombre: datos.nombre, id: salidaNumero() });
      empleado = r.outBinds.id[0];
    }
    const r = await c.execute(`INSERT INTO Usuario(email,password_hash,rol,activo,id_empleado,id_cliente)
      VALUES(:email,:hash,:rol,:activo,:empleado,:cliente) RETURNING id_usuario INTO :id`, {
      email: datos.email, hash, rol: datos.rol, activo: datos.activo === false ? 0 : 1,
      empleado, cliente, id: salidaNumero(),
    });
    if (datos.rol === 'REPARTIDOR') await cambiarComunas(c, empleado, datos.comunas || []);
    const usuario = usuarioPublico(await buscarUsuario(r.outBinds.id[0], c));
    const eventos = !creado ? [await auditar(c,'CLIENTE_VINCULADO_USUARIO',actor || usuario,{id_cliente:cliente,id_usuario:usuario.id_usuario})] : [];
    return { usuario, eventos };
  });
  if(resultado.eventos.length) await estadoSincronizacion(resultado.eventos);
  return resultado.usuario;
}
export async function editarUsuario(id, datos) {
  const hash = datos.password ? await bcrypt.hash(datos.password, 12) : null;
  return transaccion(async c => {
    // Serializa cambios de administradores para no desactivar al ultimo ADMIN activo.
    await c.execute('LOCK TABLE Usuario IN EXCLUSIVE MODE');
    const actual = await buscarUsuario(id, c);
    exigir(actual, 'Usuario no encontrado.', 404);
    const rol = datos.rol || actual.rol;
    exigir((rol === 'CLIENTE') === (actual.rol === 'CLIENTE'), 'No se puede convertir un cliente en empleado ni al reves.', 409);
    if (actual.rol === 'ADMIN' && actual.activo === 1 && (rol !== 'ADMIN' || datos.activo === false)) {
      const [conteo] = await consultar(c, "SELECT COUNT(*) cantidad FROM Usuario WHERE rol='ADMIN' AND activo=1");
      exigir(conteo.cantidad > 1, 'No puedes desactivar ni cambiar el rol del ultimo administrador activo.', 409);
    }
    const mapa = { email: 'email', rol: 'rol', activo: 'activo' };
    const sets = [];
    const binds = { id };
    for (const campo of Object.keys(mapa)) if (Object.hasOwn(datos, campo)) {
      sets.push(`${mapa[campo]}=:${campo}`);
      binds[campo] = campo === 'activo' ? Number(datos[campo]) : datos[campo];
    }
    if (hash) { sets.push('password_hash=:hash'); binds.hash = hash; }
    if (hash || Object.hasOwn(datos, 'rol') || Object.hasOwn(datos, 'activo')) sets.push('token_version=token_version+1');
    if (sets.length) await c.execute(`UPDATE Usuario SET ${sets.join(',')} WHERE id_usuario=:id`, binds);
    if (actual.id_cliente) {
      const columnas = { nombre: 'nombre', telefono: 'telefono', direccion_principal: 'direccion_principal', id_comuna: 'id_comuna' };
      const cambios = Object.keys(columnas).filter(k => Object.hasOwn(datos, k));
      if((datos.direccion_principal!==undefined && datos.direccion_principal!==actual.direccion_principal) || (datos.id_comuna!==undefined && datos.id_comuna!==actual.id_comuna))
        await c.execute('UPDATE Cliente SET calle_principal=NULL,numero_principal=NULL,referencia_principal=NULL WHERE id_cliente=:id',{id:actual.id_cliente});
      if (cambios.length) await c.execute(`UPDATE Cliente SET ${cambios.map(k => `${columnas[k]}=:${k}`).join(',')} WHERE id_cliente=:id`,
        Object.fromEntries([['id', actual.id_cliente], ...cambios.map(k => [k, datos[k]])]));
    } else {
      exigir(!['telefono', 'direccion_principal', 'id_comuna'].some(k => Object.hasOwn(datos, k)), 'Los datos de domicilio solo corresponden a clientes.');
      if (datos.nombre) await c.execute('UPDATE Empleado SET nombre=:nombre WHERE id_empleado=:id', { nombre: datos.nombre, id: actual.id_empleado });
      if (rol === 'ADMIN' && actual.rol === 'REPARTIDOR') await cambiarComunas(c, actual.id_empleado, []);
    }
    return usuarioPublico(await buscarUsuario(id, c));
  });
}
export async function comunas() {
  return conConexion(c => consultar(c, 'SELECT id_comuna,nombre FROM Comuna ORDER BY nombre'));
}
export async function repartidores(comuna) {
  return conConexion(async c => {
    const filas = await consultar(c, `SELECT e.id_empleado,e.nombre,u.id_usuario,
      CASE WHEN EXISTS(SELECT 1 FROM Repartidor_Comuna rc WHERE rc.id_empleado=e.id_empleado AND rc.id_comuna=:comuna)
        THEN 1 ELSE 0 END cubre_comuna
      FROM Empleado e JOIN Usuario u ON u.id_empleado=e.id_empleado
      WHERE u.rol='REPARTIDOR' AND u.activo=1 ORDER BY cubre_comuna DESC,e.nombre`, { comuna });
    const coberturas = await consultar(c, `SELECT rc.id_empleado,co.id_comuna,co.nombre
      FROM Repartidor_Comuna rc JOIN Comuna co ON co.id_comuna=rc.id_comuna ORDER BY co.nombre`);
    return filas.map(r => ({ ...r, cubre_comuna: r.cubre_comuna === 1,
      comunas: coberturas.filter(co => co.id_empleado === r.id_empleado).map(({ id_comuna, nombre }) => ({ id_comuna, nombre })) }));
  });
}
export async function asignarComunas(empleado, ids) {
  return transaccion(async c => {
    const [u] = await consultar(c, "SELECT id_usuario FROM Usuario WHERE id_empleado=:id AND rol='REPARTIDOR' AND activo=1 FOR UPDATE", { id: empleado });
    exigir(u, 'Repartidor activo no encontrado.', 404);
    await cambiarComunas(c, empleado, ids);
    return { id_empleado: empleado, comunas: ids };
  });
}
