import oracledb from 'oracledb';
import { oraclePool } from '../config/databases.js';

export async function consultar(conexion, sql, binds = {}, opciones = {}) {
  const resultado = await conexion.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, ...opciones });
  return (resultado.rows || []).map(fila => Object.fromEntries(
    Object.entries(fila).map(([campo, valor]) => [campo.toLowerCase(), valor]),
  ));
}

export async function conConexion(operacion) {
  const conexion = await oraclePool.getConnection();
  conexion.callTimeout = 10000;
  try { return await operacion(conexion); }
  finally { await conexion.close(); }
}

export async function transaccion(operacion) {
  return conConexion(async conexion => {
    try {
      const resultado = await operacion(conexion);
      await conexion.commit();
      return resultado;
    } catch (error) {
      await conexion.rollback();
      throw error;
    }
  });
}
export const salidaNumero = () => ({ dir: oracledb.BIND_OUT, type: oracledb.NUMBER });
