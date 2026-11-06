import { app } from './app.js';
import { oraclePool, mongoClient } from './config/databases.js';
import { procesarPendientes } from './services/sincronizacion.js';
import { conConexion, consultar } from './services/oracle.js';

await conConexion(async conexion => {
  try {
    await conexion.execute('SELECT token_version FROM Usuario WHERE 1=0');
    const [r] = await consultar(conexion, "SELECT COUNT(*) cantidad FROM user_sequences WHERE sequence_name IN ('SEQ_PRODUCTO','SEQ_EMPLEADO')");
    if (r.cantidad !== 2) throw new Error('Esquema incompleto');
    await conexion.execute('SELECT clave,carrito_version FROM Solicitud_Venta WHERE 1=0');
    await conexion.execute('SELECT fecha_cobro FROM Venta WHERE 1=0');
    await conexion.execute('SELECT clave FROM Solicitud_Control WHERE 1=0');
  } catch (error) {
    if ([904, 942].includes(error.errorNum) || error.message === 'Esquema incompleto') {
      throw new Error('Faltan migraciones de API. Ejecuta .scripts/aplicar-control.sh en el contenedor Oracle (07 a 09).');
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
