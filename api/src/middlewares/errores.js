export class ErrorHttp extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}
export function manejarErrores(error, req, res, next) {
  if (res.headersSent) return next(error);
  let estado = error.estado || 500;
  let mensaje = error.estado ? error.message : 'Error interno del servidor.';
  if (error.type === 'entity.parse.failed') { estado = 400; mensaje = 'El cuerpo debe ser JSON valido.'; }
  else if (error.type === 'entity.too.large') { estado = 413; mensaje = 'La solicitud supera el tamano permitido.'; }
  else if (error.code === 11000 && error.keyPattern?.telefono) {
    estado = 409; mensaje = 'El teléfono ya corresponde a otro cliente.'; error.campos = { telefono: mensaje };
  } else if (error.code === 11000) { estado = 409; mensaje = 'Ya existe un registro con esos datos unicos.'; }
  else if (error.code === 121) { estado = 400; mensaje = 'Los datos no cumplen las restricciones del modelo.'; }
  else if (/^Mongo(Network|ServerSelection|TopologyClosed|NotConnected)/.test(error.name || '') ||
    (error.name === 'MongoServerError' && [13, 18].includes(error.code))) {
    estado = 503; mensaje = 'Una base de datos no esta disponible. Intenta nuevamente.';
  }
  // No registrar cuerpos, hashes, tokens, contraseñas ni cadenas de conexión.
  if (estado >= 500) console.error('Error de API:', error.code || error.name);
  res.status(estado).json({ mensaje, ...(error.campos ? { campos: error.campos } : {}) });
}
