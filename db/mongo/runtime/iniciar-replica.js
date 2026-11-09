// Se conecta localmente. Nunca escribir las credenciales en mensajes o URLs.
const admin = db.getSiblingDB('admin');
if (!admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) {
  throw new Error('MongoDB todavía no permite inicializar el replica set.');
}
const opciones = admin.runCommand({ getCmdLineOpts: 1 });
if (opciones.parsed?.replication?.replSet !== 'rs0') {
  throw new Error('Esperando al proceso definitivo de MongoDB.');
}
try {
  rs.status();
} catch (error) {
  if (error.code !== 94) throw error;
  const resultado = rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] });
  if (resultado.ok !== 1) throw new Error('No se pudo iniciar rs0.');
}
if (!db.hello().isWritablePrimary) throw new Error('Esperando elección del primario.');
