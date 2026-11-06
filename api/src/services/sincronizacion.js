import oracledb from 'oracledb';
import { mongoDb } from '../config/databases.js';
import { transaccion, consultar, salidaNumero } from './oracle.js';

export async function encolar(conexion, tipo, datos) {
  const r = await conexion.execute(`INSERT INTO Pendiente_Mongo(tipo,payload)
    VALUES(:tipo,:payload) RETURNING id_evento INTO :id`, {
    tipo, payload: { val: JSON.stringify(datos), type: oracledb.CLOB }, id: salidaNumero(),
  });
  return r.outBinds.id[0];
}
export async function auditar(conexion, tipo, usuario, detalle) {
  return encolar(conexion, 'AUDITORIA', { tipo, fecha: new Date().toISOString(),
    usuario: { id: usuario.id_usuario, rol: usuario.rol }, detalle });
}
let trabajoActual;
async function vaciar() {
  // FIFO: no aplicar una edicion nueva antes de una antigua que todavia fallo.
  for (let i = 0; i < 25; i += 1) {
    const continuar = await transaccion(async c => {
      const [evento] = await consultar(c, `SELECT id_evento,tipo,payload FROM Pendiente_Mongo
        WHERE id_evento=(SELECT MIN(id_evento) FROM Pendiente_Mongo WHERE estado='PENDIENTE')
        AND estado='PENDIENTE' FOR UPDATE NOWAIT`, {}, { fetchInfo: { PAYLOAD: { type: oracledb.STRING } } });
      if (!evento) return false;
      try {
        const datos = JSON.parse(evento.payload);
        if (evento.tipo === 'CATALOGO_CREAR') {
          await mongoDb.collection('catalogo').updateOne({ id_producto: datos.id_producto }, { $set: datos }, { upsert: true });
        } else if (evento.tipo === 'CATALOGO_EDITAR') {
          const r = await mongoDb.collection('catalogo').updateOne({ id_producto: datos.id_producto }, { $set: datos.cambios });
          if (!r.matchedCount && !datos.permitir_ausente) throw new Error('CatalogoNoEncontrado');
        } else if (evento.tipo === 'AUDITORIA') {
          await mongoDb.collection('eventos_auditoria').updateOne({ _id: `oracle-${evento.id_evento}` },
            { $setOnInsert: { ...datos, fecha: new Date(datos.fecha) } }, { upsert: true });
        } else throw new Error('EventoNoSoportado');
        await c.execute("UPDATE Pendiente_Mongo SET estado='PROCESADO',ultimo_error=NULL WHERE id_evento=:id", { id: evento.id_evento });
        return true;
      } catch (error) {
        const codigo = String(error.code || error.name).slice(0, 100);
        await c.execute('UPDATE Pendiente_Mongo SET intentos=intentos+1,ultimo_error=:codigo WHERE id_evento=:id', { codigo, id: evento.id_evento });
        console.error('Sincronizacion Mongo pendiente:', evento.id_evento, codigo);
        return false;
      }
    });
    if (!continuar) break;
  }
}
export async function procesarPendientes() {
  if (!trabajoActual) trabajoActual = vaciar().catch(error => {
    // Otro proceso puede estar trabajando el primer evento; se reintenta luego.
    if (error.errorNum !== 54) console.error('Error del sincronizador:', error.code || error.name);
  }).finally(() => { trabajoActual = undefined; });
  await trabajoActual;
}
export async function estadoSincronizacion(ids) {
  try {
    await procesarPendientes();
    return await transaccion(async c => {
      for (const id of ids) {
        const [r] = await consultar(c, 'SELECT estado FROM Pendiente_Mongo WHERE id_evento=:id', { id });
        if (r?.estado !== 'PROCESADO') return 'PENDIENTE';
      }
      return 'OK';
    });
  } catch {
    // Oracle ya confirmo: una comprobacion posterior fallida no cambia el resultado.
    return 'PENDIENTE';
  }
}
