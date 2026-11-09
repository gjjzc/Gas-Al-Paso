// El entrypoint oficial ejecuta este archivo solo al inicializar un volumen nuevo.
// La API recibe este usuario; las credenciales root quedan únicamente en Mongo.
const aplicacion = db.getSiblingDB('gas_al_paso');
const usuario = process.env.MONGO_APP_USER;
const clave = process.env.MONGO_APP_PASSWORD;
if (!usuario || !clave) throw new Error('Faltan las credenciales del usuario de aplicación.');
if (usuario === process.env.MONGO_INITDB_ROOT_USERNAME) {
  throw new Error('El usuario de aplicación debe ser distinto del usuario root.');
}
aplicacion.createUser({
  user: usuario,
  pwd: clave,
  roles: [{ role: 'readWrite', db: 'gas_al_paso' }],
});
print('Usuario de aplicación creado con readWrite solo sobre gas_al_paso.');
