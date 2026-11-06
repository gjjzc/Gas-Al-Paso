import { oraclePool, mongoDb } from '../config/databases.js';

async function verificarOracle() {
  let conexion;
  try {
    conexion = await oraclePool.getConnection();
    conexion.callTimeout = 5000;
    await conexion.execute('SELECT 1 FROM DUAL');
  } finally {
    if (conexion) await conexion.close();
  }
}

export async function verificarBases() {
  // Una caída no impide comprobar la otra base.
  const resultados = await Promise.allSettled([
    verificarOracle(),
    mongoDb.command({ ping: 1 }),
  ]);
  const [oracle, mongo] = resultados.map((resultado) =>
    resultado.status === 'fulfilled' ? 'OK' : 'ERROR',
  );
  return { estado: oracle === 'OK' && mongo === 'OK' ? 'OK' : 'ERROR', oracle, mongo };
}
