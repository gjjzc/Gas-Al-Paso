import jwt from 'jsonwebtoken';
import { jwtSecret, jwtOpciones } from '../config/seguridad.js';
import { buscarUsuario } from '../services/usuarios.js';
import { ErrorHttp } from './errores.js';

export async function autenticar(req, res, next) {
  const cabecera = req.get('Authorization') || '';
  if (!/^Bearer \S+$/i.test(cabecera)) throw new ErrorHttp(401, 'Debes iniciar sesion y enviar Authorization: Bearer TOKEN.');
  let claims;
  try {
    claims = jwt.verify(cabecera.split(' ')[1], jwtSecret, {
      algorithms: ['HS256'], issuer: jwtOpciones.issuer, audience: jwtOpciones.audience,
    });
    if (!/^[1-9]\d*$/.test(claims.sub)) throw new Error('sub invalido');
  } catch {
    throw new ErrorHttp(401, 'Token invalido o vencido. Inicia sesion nuevamente.');
  }
  // Consultar el estado vigente impide seguir usando tokens de usuarios desactivados.
  const usuario = await buscarUsuario(Number(claims.sub));
  if (!usuario || usuario.activo !== 1 || usuario.token_version !== claims.version || usuario.rol !== claims.rol) {
    throw new ErrorHttp(401, 'La sesion ya no es valida. Inicia sesion nuevamente.');
  }
  req.usuario = usuario;
  next();
}
export function permitir(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) throw new ErrorHttp(403, 'Tu rol no tiene permiso para esta operacion.');
    next();
  };
}
