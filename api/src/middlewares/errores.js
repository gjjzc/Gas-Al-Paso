export function manejarErrores(error, req, res, next) {
  // No devolver credenciales ni detalles internos en la respuesta pública.
  console.error('Error de API:', error.code || error.name);
  res.status(500).json({ mensaje: 'Error interno del servidor.' });
}
