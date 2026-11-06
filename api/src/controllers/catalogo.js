import { campos, texto, entero, booleano, exigir, idRuta, paginacion } from '../middlewares/validar.js';
import * as servicio from '../services/catalogo.js';

function validar(cuerpo, alta = false, soloOracle = false) {
  const permitidos = soloOracle ? ['precio', 'stock', 'activo']
    : ['nombre', 'descripcion', 'categoria', 'peso', 'precio', 'stock', 'activo', 'imagen', 'atributos', 'destacado'];
  campos(cuerpo, permitidos, alta ? ['nombre', 'descripcion', 'categoria', 'peso', 'precio', 'stock'] : []);
  exigir(Object.keys(cuerpo).length > 0, 'Debes indicar al menos un campo.');
  const datos = {};
  for (const [campo, valor] of Object.entries(cuerpo)) {
    if (campo === 'nombre') datos[campo] = texto(valor, campo, 50);
    if (campo === 'descripcion') datos[campo] = texto(valor, campo, 100);
    if (campo === 'categoria') { exigir(['GAS', 'ACCESORIO'].includes(valor), 'Categoria invalida.'); datos[campo] = valor; }
    if (campo === 'precio') datos[campo] = entero(valor, campo, 1, 99999999);
    if (campo === 'stock') datos[campo] = entero(valor, campo, 0);
    if (['activo', 'destacado'].includes(campo)) datos[campo] = booleano(valor, campo);
    if (campo === 'peso') {
      exigir(typeof valor === 'number' && Number.isFinite(valor) && valor > 0 && valor <= 999.99 &&
        Math.abs(valor*100-Math.round(valor*100)) < 0.000001, 'peso debe ser positivo con hasta dos decimales.');
      datos[campo] = valor;
    }
    if (campo === 'imagen') datos[campo] = texto(valor, campo, 25000);
    if (campo === 'atributos') {
      exigir(valor && typeof valor === 'object' && !Array.isArray(valor) && Buffer.byteLength(JSON.stringify(valor)) <= 10000,
        'atributos debe ser un objeto JSON de hasta 10 KB.');
      datos[campo] = valor;
    }
  }
  return datos;
}
export async function listar(req, res) {
  const categoria = req.query.categoria;
  exigir(categoria === undefined || ['GAS', 'ACCESORIO'].includes(categoria), 'Categoria invalida.');
  res.json(await servicio.listar({ ...paginacion(req.query), categoria, incluirInactivos: req.incluirInactivos }));
}
export async function obtener(req, res) { res.json(await servicio.obtener(idRuta(req.params.id), req.incluirInactivos)); }
export async function crear(req, res) { res.status(201).json(await servicio.crear(validar(req.body, true), req.usuario)); }
export async function editar(req, res) { res.json(await servicio.editar(idRuta(req.params.id), validar(req.body), req.usuario)); }
export async function eliminar(req, res) { res.json(await servicio.eliminar(idRuta(req.params.id), req.usuario)); }
export async function producto(req, res) { res.json(await servicio.editar(idRuta(req.params.id), validar(req.body, false, true), req.usuario, true)); }
