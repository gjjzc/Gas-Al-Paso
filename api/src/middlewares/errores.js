export class ErrorHttp extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

export function manejarErrores(error, req, res, next) {
  if (res.headersSent) return next(error);
  let estado = error.estado || 500;
  let mensaje = error.estado ? error.message : 'Error interno del servidor.';
  if (error.type === 'entity.parse.failed') { estado = 400; mensaje = 'El cuerpo debe ser JSON valido.'; }
  else if (error.type === 'entity.too.large') { estado = 413; mensaje = 'La solicitud supera el tamano permitido.'; }
  else if (error.errorNum === 20021) { estado = 400; mensaje = 'El teléfono debe tener 9 dígitos y comenzar con 9.'; error.campos = { telefono: mensaje }; }
  else if (error.errorNum === 1 && /UQ_CLIENTE_TELEFONO/i.test(error.message || '')) { estado = 409; mensaje = 'El teléfono ya corresponde a otro cliente.'; error.campos = { telefono: mensaje }; }
  else if (error.errorNum === 1 || error.code === 11000) { estado = 409; mensaje = 'Ya existe un registro con esos datos unicos.'; }
  else if (error.errorNum === 20003) { estado = 409; mensaje = 'Stock insuficiente para completar la venta.'; }
  else if ([20004, 20014, 20015].includes(error.errorNum)) { estado = 409; mensaje = 'La venta no permite esa operacion en su estado actual.'; }
  else if ([20001, 20006, 20010, 20011, 20013, 1438].includes(error.errorNum)) { estado = 400; mensaje = 'Los datos de la venta no son validos.'; }
  else if ([20002, 20005, 20012].includes(error.errorNum)) { estado = 404; mensaje = 'Producto o empleado activo no encontrado.'; }
  else if (error.errorNum === 2291) { estado = 400; mensaje = 'Una de las referencias indicadas no existe.'; }
  else if (error.errorNum === 2292) { estado = 409; mensaje = 'El registro tiene datos asociados y no puede eliminarse.'; }
  else if ([1400, 2290, 12899].includes(error.errorNum) || error.code === 121) { estado = 400; mensaje = 'Los datos no cumplen las restricciones del modelo.'; }
  else if (/^Mongo(Network|ServerSelection|TopologyClosed|NotConnected)/.test(error.name || '') || (error.name === 'MongoServerError' && [13, 18].includes(error.code)) ||
      /^(NJS|DPI)-/.test(error.code || '') || [1017, 12154, 12514, 12541, 3113, 3114].includes(error.errorNum)) {
    estado = 503; mensaje = 'Una base de datos no esta disponible. Intenta nuevamente.';
  }
  // No registrar cuerpos, hashes, tokens, contraseñas ni cadenas de conexión.
  if (estado >= 500) console.error('Error de API:', error.code || error.name);
  res.status(estado).json({ mensaje, ...(error.campos ? { campos: error.campos } : {}) });
}
