import { ErrorHttp } from './errores.js';
export function errorCampo(campo, mensaje, estado = 400) {
  const error = new ErrorHttp(estado, mensaje);
  error.campos = { [campo]: mensaje };
  throw error;
}
export function nombreCliente(valor) {
  if (
    typeof valor !== 'string' ||
    valor.trim().length < 2 ||
    valor.trim().length > 80
  )
    errorCampo('nombre', 'El nombre debe tener entre 2 y 80 caracteres.');
  return valor.trim();
}
export function normalizarTelefono(valor) {
  if (
    typeof valor !== 'string' ||
    valor.length > 40 ||
    !/^[+\d\s().-]+$/.test(valor)
  )
    errorCampo(
      'telefono',
      'Ingresa un teléfono móvil válido: 9 dígitos comenzando con 9.',
    );
  let digitos = valor.replace(/\D/g, '');
  if (digitos.length === 13 && digitos.startsWith('0056'))
    digitos = digitos.slice(4);
  else if (digitos.length === 11 && digitos.startsWith('56'))
    digitos = digitos.slice(2);
  if (!/^9\d{8}$/.test(digitos))
    errorCampo(
      'telefono',
      'El teléfono debe tener 9 dígitos y comenzar con 9. Puedes incluir +56.',
    );
  return digitos;
}
