import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { jwtSecret, jwtOpciones } from '../config/seguridad.js';
import { campos, correo, password, exigir } from '../middlewares/validar.js';
import { buscarLogin, buscarUsuario, crearUsuario, usuarioPublico } from '../services/usuarios.js';
import { validarAlta } from './usuarios.js';

const hashFicticio = await bcrypt.hash('comparacion-ficticia-sin-cuenta', 12);
export async function login(req, res) {
  campos(req.body, ['email', 'password'], ['email', 'password']);
  const email = correo(req.body.email);
  const clave = password(req.body.password, false);
  const usuario = await buscarLogin(email);
  const coincide = await bcrypt.compare(clave, usuario?.password_hash || hashFicticio);
  exigir(usuario && coincide && usuario.activo === 1, 'Email o contrasena incorrectos.', 401);
  const token = jwt.sign({ rol: usuario.rol, version: usuario.token_version }, jwtSecret,
    { ...jwtOpciones, subject: String(usuario.id_usuario) });
  res.json({ token, tipo: 'Bearer', expira_en: 3600, usuario: usuarioPublico(await buscarUsuario(usuario.id_usuario)) });
}
export async function registro(req, res) {
  const datos = validarAlta(req.body, true);
  const usuario = await crearUsuario(datos);
  res.status(201).json({ mensaje: 'Registro completado. Ya puedes iniciar sesion.', usuario });
}
export function me(req, res) { res.json(usuarioPublico(req.usuario)); }
