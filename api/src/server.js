import { asegurarIndiceClientes } from './services/indices-clientes.js';
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
    await conexion.execute('SELECT telefono_revision,calle_principal,numero_principal,referencia_principal FROM Cliente WHERE 1=0');
    const [indice] = await consultar(conexion, "SELECT COUNT(*) cantidad FROM user_indexes WHERE index_name='UQ_CLIENTE_TELEFONO' AND uniqueness='UNIQUE'");
    if(!indice.cantidad) throw new Error('Esquema incompleto');
  } catch (error) {
    if ([904, 942].includes(error.errorNum) || error.message === 'Esquema incompleto') {
      throw new Error('Faltan migraciones de API. Ejecuta .scripts/aplicar-control.sh y .scripts/aplicar-clientes.sh en Oracle (07 a 11).');
    }
    throw error;
  }
});

// El indice se recupera tambien al buscar; Mongo caido no impide iniciar las operaciones Oracle.
void asegurarIndiceClientes().catch(() => console.error('Indice de clientes pendiente: Mongo no disponible.'));
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
