import { app } from './app.js';
import { oraclePool, mongoClient } from './config/databases.js';
import { procesarPendientes } from './services/sincronizacion.js';
import { conConexion, consultar } from './services/oracle.js';

await conConexion(async conexion => {
  try {
    await conexion.execute('SELECT token_version FROM Usuario WHERE 1=0');
    const [r] = await consultar(conexion, "SELECT COUNT(*) cantidad FROM user_sequences WHERE sequence_name IN ('SEQ_PRODUCTO','SEQ_EMPLEADO')");
    if (r.cantidad !== 2) throw new Error('Esquema incompleto');
  } catch (error) {
    if (error.errorNum === 904 || error.message === 'Esquema incompleto') {
      throw new Error('Falta la migracion 07-api.sql. Ejecuta .scripts/aplicar-api.sh en el contenedor Oracle.');
    }
    throw error;
  }
});

const servidor = app.listen(process.env.PORT || 4000, '0.0.0.0', () => {
  console.log('API Gas al Paso iniciada.');
});
// Los pendientes sobreviven reinicios en Oracle. No se deshace una escritura
// confirmada porque Mongo este caido; el sincronizador vuelve a intentar.
const sincronizador = setInterval(() => { void procesarPendientes(); }, 5000);
sincronizador.unref();
void procesarPendientes();
function cerrar() {
  clearInterval(sincronizador);
  servidor.close(async () => {
    await procesarPendientes();
    await Promise.allSettled([oraclePool.close(0), mongoClient.close()]);
    process.exit(0);
  });
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
