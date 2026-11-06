import { createHash, randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { consultar, conConexion, transaccion, salidaNumero } from './oracle.js';
import { asegurarDiaAbierto, fechaActual } from './jornada.js';
import { auditar, estadoSincronizacion } from './sincronizacion.js';
import { exigir } from '../middlewares/validar.js';

const esBalon = peso => [5,11,15,45].includes(peso);
const centavos = monto => Math.round(monto*100);
const diferencia = (entregado, esperado) => (centavos(entregado)-centavos(esperado))/100;
async function pendientes(c, empleado) {
  return consultar(c, `SELECT id_venta,id_pedido_mongo FROM Venta WHERE id_empleado=:id
    AND estado_registro='CONFIRMADA' AND estado_pago='PENDIENTE' AND canal IN ('WEB','LLAMADA') ORDER BY id_venta`, { id: empleado });
}
async function dineroEsperado(c, empleado, fecha) {
  const [r] = await consultar(c, `SELECT COUNT(*) cantidad,NVL(SUM(subtotal),0) subtotal,
    NVL(SUM(descuento),0) descuento,NVL(SUM(total_venta),0) total,
    NVL(SUM(CASE WHEN metodo_pago='EFECTIVO' THEN total_venta ELSE 0 END),0) efectivo,
    NVL(SUM(CASE WHEN metodo_pago='TRANSFERENCIA' THEN total_venta ELSE 0 END),0) transferencia
    FROM Venta WHERE id_empleado=:id AND estado_pago='COBRADA' AND estado_registro='CONFIRMADA'
    AND NVL(fecha_cobro,fecha_venta)>=TO_DATE(:fecha,'YYYY-MM-DD')
    AND NVL(fecha_cobro,fecha_venta)<TO_DATE(:fecha,'YYYY-MM-DD')+1`, { id: empleado, fecha });
  return r;
}
async function balonesDia(c, empleado, fecha, cierreId) {
  const cargas = await consultar(c, `SELECT ca.id_producto,p.nombre,p.peso,ca.cantidad_cargada
    FROM Carga_diaria ca JOIN Productos p ON p.id_producto=ca.id_producto
    WHERE ca.id_empleado=:id AND ca.fecha=TO_DATE(:fecha,'YYYY-MM-DD')`, { id: empleado, fecha });
  const vendidos = await consultar(c, `SELECT d.id_producto,p.nombre,p.peso,SUM(d.cantidad) vendido
    FROM Venta v JOIN Detalle_venta d ON d.id_venta=v.id_venta JOIN Productos p ON p.id_producto=d.id_producto
    WHERE v.id_empleado=:id AND v.estado_pago='COBRADA' AND v.estado_registro='CONFIRMADA'
      AND NVL(v.fecha_cobro,v.fecha_venta)>=TO_DATE(:fecha,'YYYY-MM-DD')
      AND NVL(v.fecha_cobro,v.fecha_venta)<TO_DATE(:fecha,'YYYY-MM-DD')+1
    GROUP BY d.id_producto,p.nombre,p.peso`, { id: empleado, fecha });
  const declarados = cierreId ? await consultar(c, `SELECT cs.*,p.nombre,p.peso FROM Cierre_stock cs
    JOIN Productos p ON p.id_producto=cs.id_producto WHERE cs.id_cierre=:id`, { id: cierreId }) : [];
  const mapa = new Map();
  for (const fila of [...cargas,...declarados]) mapa.set(fila.id_producto, {
    id_producto: fila.id_producto, nombre: fila.nombre, peso: fila.peso, cargado: 0, vendido: 0,
  });
  for (const fila of vendidos) if (esBalon(fila.peso) || mapa.has(fila.id_producto)) {
    if (!mapa.has(fila.id_producto)) mapa.set(fila.id_producto, { id_producto: fila.id_producto, nombre: fila.nombre, peso: fila.peso, cargado: 0, vendido: 0 });
    mapa.get(fila.id_producto).vendido = fila.vendido;
  }
  for (const fila of cargas) mapa.get(fila.id_producto).cargado = fila.cantidad_cargada;
  for (const fila of declarados) mapa.get(fila.id_producto).declaracion = fila;
  return [...mapa.values()].sort((a,b) => a.id_producto-b.id_producto);
}
function metodo(esperado, entregado) {
  const dif = entregado === null ? null : diferencia(entregado, esperado);
  return { esperado, entregado, diferencia: dif, descuadre: dif === null ? null : dif !== 0 };
}
async function reporte(c, empleado, fecha) {
  const [persona] = await consultar(c, `SELECT e.id_empleado,e.nombre,u.activo,u.rol FROM Empleado e
    LEFT JOIN Usuario u ON u.id_empleado=e.id_empleado WHERE e.id_empleado=:id`, { id: empleado });
  exigir(persona, 'Empleado no encontrado.', 404);
  const [cierre] = await consultar(c, `SELECT id_cierre,total_esperado,monto_entregado,diferencia,observacion,
    esperado_efectivo,esperado_transferencia,entregado_efectivo,entregado_transferencia
    FROM Cierre_caja WHERE id_empleado=:id AND fecha=TO_DATE(:fecha,'YYYY-MM-DD')`, { id: empleado, fecha });
  const ventas = await dineroEsperado(c, empleado, fecha);
  // Incluye accesorios, ademas de los balones del control fisico.
  const productosVendidos = await consultar(c, `SELECT d.id_producto,p.nombre,SUM(d.cantidad) cantidad,
    SUM(d.subtotal) subtotal,SUM(d.descuento) descuento,SUM(d.total_venta) total
    FROM Venta v JOIN Detalle_venta d ON d.id_venta=v.id_venta JOIN Productos p ON p.id_producto=d.id_producto
    WHERE v.id_empleado=:id AND v.estado_pago='COBRADA' AND v.estado_registro='CONFIRMADA'
      AND NVL(v.fecha_cobro,v.fecha_venta)>=TO_DATE(:fecha,'YYYY-MM-DD')
      AND NVL(v.fecha_cobro,v.fecha_venta)<TO_DATE(:fecha,'YYYY-MM-DD')+1
    GROUP BY d.id_producto,p.nombre ORDER BY d.id_producto`, { id: empleado, fecha });
  const base = await balonesDia(c, empleado, fecha, cierre?.id_cierre);
  const efectivo = metodo(ventas.efectivo, cierre ? cierre.entregado_efectivo : null);
  const transferencia = metodo(ventas.transferencia, cierre ? cierre.entregado_transferencia : null);
  const total = metodo(ventas.total, cierre ? cierre.monto_entregado : null);
  const balones = base.map(({ declaracion, ...fila }) => {
    const devuelto = cierre ? (declaracion?.devuelto || 0) : null;
    const dif = cierre ? fila.vendido+devuelto-fila.cargado : null;
    return { ...fila, devuelto, diferencia: dif, descuadre: dif === null ? null : dif !== 0,
      declarado: cierre ? Boolean(declaracion) : false };
  });
  const cambiado = cierre && (centavos(cierre.total_esperado) !== centavos(ventas.total) ||
    centavos(cierre.esperado_efectivo) !== centavos(ventas.efectivo) ||
    centavos(cierre.esperado_transferencia) !== centavos(ventas.transferencia) ||
    base.some(f => !f.declaracion || f.declaracion.cargado !== f.cargado || f.declaracion.vendido !== f.vendido));
  const descuadreDinero = cierre ? efectivo.descuadre || transferencia.descuadre || total.descuadre : null;
  const descuadre = cierre ? Boolean(descuadreDinero || balones.some(b => b.descuadre) || cambiado) : null;
  return { fecha, id_empleado: empleado, nombre: persona.nombre, activo: persona.activo === 1,
    estado: cierre ? (descuadre ? 'DESCUADRE' : 'CUADRADO') : 'ABIERTO', descuadre,
    dinero: { efectivo, transferencia, total, descuadre: descuadreDinero }, balones, ventas, productos_vendidos: productosVendidos,
    pedidos_sin_resolver: await pendientes(c, empleado),
    cierre: cierre ? { ...cierre, desactualizado: Boolean(cambiado) } : null };
}
async function buscarSolicitud(c, usuario, clave, tipo, hash) {
  const [r] = await consultar(c, 'SELECT tipo,huella,resultado FROM Solicitud_Control WHERE id_usuario=:id AND clave=:clave',
    { id: usuario.id_usuario, clave }, { fetchInfo: { RESULTADO: { type: oracledb.STRING } } });
  if (!r) return null;
  exigir(r.tipo === tipo && r.huella === hash, 'Idempotency-Key ya se uso con otros datos.', 409);
  return { ...JSON.parse(r.resultado), reutilizada: true };
}
async function operar(usuario, empleado, tipo, datos, clave, accion) {
  clave ||= randomUUID();
  const hash = createHash('sha256').update(JSON.stringify({ tipo, ...datos })).digest('hex');
  let r;
  try {
    r = await transaccion(async c => {
      // Misma fila de coordinacion para cargas, cierre, tarreo, asignacion y entrega.
      const [persona] = await consultar(c, 'SELECT id_empleado FROM Empleado WHERE id_empleado=:id FOR UPDATE', { id: empleado });
      exigir(persona, 'Empleado no encontrado.', 404);
      const anterior = await buscarSolicitud(c, usuario, clave, tipo, hash);
      if (anterior) return anterior;
      const fecha = datos.fecha || await fechaActual(c);
      const resultado = await accion(c, fecha);
      try {
        await c.execute('INSERT INTO Solicitud_Control(id_usuario,clave,tipo,huella,resultado) VALUES(:id,:clave,:tipo,:hash,:resultado)', {
          id: usuario.id_usuario, clave, tipo, hash, resultado: { val: JSON.stringify(resultado), type: oracledb.CLOB },
        });
      } catch (error) { if (error.errorNum === 1) error.claveControl = true; throw error; }
      return { ...resultado, reutilizada: false };
    });
  } catch (error) {
    if (!error.claveControl) throw error;
    r = await conConexion(c => buscarSolicitud(c, usuario, clave, tipo, hash));
    exigir(r, 'La operacion concurrente no se completo. Reintenta con la misma clave.', 409);
  }
  return { ...r.salida, clave_idempotencia: clave, reutilizada: r.reutilizada,
    sincronizacion: await estadoSincronizacion(r.eventos) };
}
export async function cargar(usuario, datos, clave) {
  return operar(usuario, datos.id_empleado, 'CARGA', datos, clave, async (c, fecha) => {
    await asegurarDiaAbierto(c, datos.id_empleado, fecha);
    const [rep] = await consultar(c, "SELECT id_usuario FROM Usuario WHERE id_empleado=:id AND rol='REPARTIDOR' AND activo=1", { id: datos.id_empleado });
    exigir(rep, 'Repartidor activo no encontrado.', 404);
    const items = [];
    for (const item of datos.items) {
      const [p] = await consultar(c, 'SELECT nombre,peso,activo FROM Productos WHERE id_producto=:id', { id: item.id_producto });
      exigir(p && p.activo === 1 && esBalon(p.peso), 'La carga solo admite balones activos de 5, 11, 15 o 45 kg.', 400);
      const [previa] = await consultar(c, "SELECT cantidad_cargada FROM Carga_diaria WHERE id_empleado=:emp AND fecha=TO_DATE(:fecha,'YYYY-MM-DD') AND id_producto=:prod",
        { emp: datos.id_empleado, fecha, prod: item.id_producto });
      const cantidad = (previa?.cantidad_cargada || 0)+item.cantidad_cargada;
      exigir(cantidad <= 999999999, 'La cantidad diaria excede el limite permitido.');
      await c.execute(`MERGE INTO Carga_diaria ca USING (SELECT :emp emp,TO_DATE(:fecha,'YYYY-MM-DD') fecha,:prod prod FROM DUAL) d
        ON (ca.id_empleado=d.emp AND ca.fecha=d.fecha AND ca.id_producto=d.prod)
        WHEN MATCHED THEN UPDATE SET cantidad_cargada=:cantidad
        WHEN NOT MATCHED THEN INSERT(id_empleado,fecha,id_producto,cantidad_cargada) VALUES(d.emp,d.fecha,d.prod,:cantidad)`,
        { emp: datos.id_empleado, fecha, prod: item.id_producto, cantidad });
      items.push({ id_producto: item.id_producto, nombre: p.nombre, cantidad_agregada: item.cantidad_cargada, cantidad_cargada: cantidad });
    }
    return { salida: { id_empleado: datos.id_empleado, fecha, items },
      eventos: [await auditar(c, 'CARGA_DIARIA', usuario, { id_empleado: datos.id_empleado, fecha, items })] };
  });
}
export async function listarCargas(filtros) {
  return conConexion(async c => {
    const fecha = filtros.fecha || await fechaActual(c);
    const cargas = await consultar(c, `SELECT ca.id_carga,ca.id_empleado,e.nombre repartidor,ca.id_producto,p.nombre producto,p.peso,ca.cantidad_cargada
      FROM Carga_diaria ca JOIN Empleado e ON e.id_empleado=ca.id_empleado JOIN Productos p ON p.id_producto=ca.id_producto
      WHERE ca.fecha=TO_DATE(:fecha,'YYYY-MM-DD') AND (:emp IS NULL OR ca.id_empleado=:emp)
      ORDER BY ca.id_empleado,ca.id_producto`, { fecha, emp: filtros.id_empleado || null });
    return { fecha, cargas };
  });
}
export async function cerrar(usuario, datos, clave) {
  return operar(usuario, usuario.id_empleado, 'CIERRE', datos, clave, async (c, fecha) => {
    exigir(fecha <= await fechaActual(c), 'No puedes cerrar una fecha futura.');
    await asegurarDiaAbierto(c, usuario.id_empleado, fecha);
    const sinResolver = await pendientes(c, usuario.id_empleado);
    exigir(sinResolver.length === 0, `No puedes cerrar: quedan ${sinResolver.length} pedidos propios sin resolver.`, 409);
    const ventas = await dineroEsperado(c, usuario.id_empleado, fecha);
    const base = await balonesDia(c, usuario.id_empleado, fecha);
    const devoluciones = new Map(datos.devueltos.map(f => [f.id_producto, f.devuelto]));
    exigir(base.every(f => devoluciones.has(f.id_producto)), 'Debes declarar devuelto para cada producto cargado o vendido, aunque sea cero.');
    const porId = new Map(base.map(f => [f.id_producto, f]));
    for (const [id] of devoluciones) if (!porId.has(id)) {
      const [p] = await consultar(c, 'SELECT nombre,peso FROM Productos WHERE id_producto=:id', { id });
      exigir(p && esBalon(p.peso), 'Una devolucion no corresponde a un balon conocido.');
      porId.set(id, { id_producto: id, nombre: p.nombre, peso: p.peso, cargado: 0, vendido: 0 });
    }
    const entregado = (centavos(datos.entregado_efectivo)+centavos(datos.entregado_transferencia))/100;
    exigir(entregado <= 9999999999.99 && ventas.total <= 9999999999.99, 'El total del cierre supera el limite permitido.');
    const r = await c.execute(`INSERT INTO Cierre_caja(id_empleado,fecha,total_esperado,monto_entregado,diferencia,observacion,
      esperado_efectivo,esperado_transferencia,entregado_efectivo,entregado_transferencia)
      VALUES(:emp,TO_DATE(:fecha,'YYYY-MM-DD'),:esperado,:entregado,:dif,:observacion,:efectivo,:transferencia,:entregadoE,:entregadoT)
      RETURNING id_cierre INTO :id`, { emp: usuario.id_empleado, fecha, esperado: ventas.total, entregado,
      dif: diferencia(entregado, ventas.total), observacion: datos.observacion || null,
      efectivo: ventas.efectivo, transferencia: ventas.transferencia,
      entregadoE: datos.entregado_efectivo, entregadoT: datos.entregado_transferencia, id: salidaNumero() });
    const idCierre = r.outBinds.id[0];
    for (const fila of porId.values()) {
      const devuelto = devoluciones.get(fila.id_producto);
      await c.execute('INSERT INTO Cierre_stock(id_cierre,id_producto,cargado,vendido,devuelto,diferencia) VALUES(:id,:producto,:cargado,:vendido,:devuelto,:dif)', {
        id: idCierre, producto: fila.id_producto, cargado: fila.cargado, vendido: fila.vendido, devuelto, dif: fila.vendido+devuelto-fila.cargado,
      });
    }
    const salida = await reporte(c, usuario.id_empleado, fecha);
    return { salida, eventos: [await auditar(c, 'CIERRE_CAJA', usuario, { id_cierre: idCierre, id_empleado: usuario.id_empleado,
      fecha, estado: salida.estado, dinero: salida.dinero, balones: salida.balones })] };
  });
}
export async function cuadratura(filtros) {
  return conConexion(async c => {
    // Todas las consultas del reporte ven el mismo punto, aunque alguien cierre a la vez.
    await c.execute('SET TRANSACTION READ ONLY');
    const fecha = filtros.fecha || await fechaActual(c);
    const personas = await consultar(c, `SELECT e.id_empleado FROM Empleado e LEFT JOIN Usuario u ON u.id_empleado=e.id_empleado
      WHERE (:emp IS NULL OR e.id_empleado=:emp) AND (u.rol='REPARTIDOR'
        OR EXISTS(SELECT 1 FROM Carga_diaria ca WHERE ca.id_empleado=e.id_empleado AND ca.fecha=TO_DATE(:fecha,'YYYY-MM-DD'))
        OR EXISTS(SELECT 1 FROM Cierre_caja cc WHERE cc.id_empleado=e.id_empleado AND cc.fecha=TO_DATE(:fecha,'YYYY-MM-DD'))
        OR EXISTS(SELECT 1 FROM Venta v WHERE v.id_empleado=e.id_empleado AND v.estado_pago='COBRADA'
          AND NVL(v.fecha_cobro,v.fecha_venta)>=TO_DATE(:fecha,'YYYY-MM-DD') AND NVL(v.fecha_cobro,v.fecha_venta)<TO_DATE(:fecha,'YYYY-MM-DD')+1))
      ORDER BY e.id_empleado`, { emp: filtros.id_empleado || null, fecha });
    const repartidores = [];
    for (const fila of personas) repartidores.push(await reporte(c, fila.id_empleado, fecha));
    return { fecha, repartidores, resumen: { abiertos: repartidores.filter(r => r.estado === 'ABIERTO').length,
      cerrados: repartidores.filter(r => r.cierre).length, con_descuadre: repartidores.filter(r => r.descuadre).length } };
  });
}

// Vista privada para preparar o recuperar el cierre del repartidor autenticado.
export async function cierrePropio(usuario, fecha) {
  return conConexion(async c => {
    await c.execute('SET TRANSACTION READ ONLY');
    return reporte(c, usuario.id_empleado, fecha || await fechaActual(c));
  });
}
