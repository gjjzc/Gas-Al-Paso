import assert from 'node:assert/strict';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {oraclePool,mongoClient,mongoDb} from './src/config/databases.js';
const base='http://127.0.0.1:4000/api';let checks=0;
const telefono=()=>`9${randomInt(10000000,89999999)}`;
async function req(method,path,body,token,status=200,key){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});const datos=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(datos)}`);checks++;return datos;}
async function sql(q,binds={}){const c=await oraclePool.getConnection();try{return (await c.execute(q,binds)).rows;}finally{await c.close();}}
function ok(valor,mensaje){assert.ok(valor,mensaje);checks++;}
const marca=Date.now();const direccion={calle:'Calle Telefonica',numero:'123',comuna:1,referencia:'Porton azul'};
try{
 const admin=await req('POST','/auth/login',{email:'admin@demo.gasalpaso.test',password:'GasPasoDemo2026!'});const token=admin.token;
 const producto=await req('POST','/catalogo',{nombre:`Telefono ${marca}`,descripcion:'Prueba pedido sin cuenta',peso:11,categoria:'GAS',precio:15000,stock:100},token,201);
 const tel=telefono();const body={cliente:{nombre:'Maria Sin Cuenta',telefono:`+56 ${tel[0]} ${tel.slice(1,5)}-${tel.slice(5)}`,direccion},items:[{id_producto:producto.id_producto,cantidad:2}],metodo_cobro:'EFECTIVO'};
 for(const [campo,cambio] of [['nombre',{nombre:'A'}],['telefono',{telefono:'812345678'}],['telefono',{telefono:'9abc12345678'}],['telefono',{telefono:'12345678'}]]){
  const e=await req('POST','/pedidos/telefonico',{...body,cliente:{...body.cliente,...cambio}},token,400);ok(e.campos?.[campo],`Error por campo ${campo}`);
 }
 const comunaMala=await req('POST','/pedidos/telefonico',{...body,cliente:{...body.cliente,direccion:{...direccion,comuna:999999}}},token,400);ok(comunaMala.campos.comuna,'Comuna existente');
 const vacio=await req('POST','/pedidos/telefonico',{...body,items:[]},token,400);ok(vacio.campos.items,'Al menos una linea');
 const cero=await req('POST','/pedidos/telefonico',{...body,items:[{id_producto:producto.id_producto,cantidad:0}]},token,400);ok(cero.campos.items,'Cantidad positiva');
 await req('POST','/pedidos/telefonico',{...body,id_cliente:1},token,400);
 const key=randomUUID();const primero=await req('POST','/pedidos/telefonico',body,token,201,key);const id=primero.cliente.id_cliente;
 ok(primero.total===27000 && primero.descuento===3000 && primero.estado==='RECIBIDO','Importes y listo para asignar');
 assert.deepEqual(primero.cliente,{id_cliente:id,nombre:'Maria Sin Cuenta',telefono:tel});checks++;
 ok((await sql('SELECT COUNT(*) FROM Usuario WHERE id_cliente=:id',{id}))[0][0]===0,'Cliente sin Usuario');
 assert.deepEqual((await sql('SELECT telefono,direccion_principal,id_comuna FROM Cliente WHERE id_cliente=:id',{id}))[0],[tel,'Calle Telefonica 123',1]);checks++;
 const copia=await req('POST','/pedidos/telefonico',{...body,cliente:{...body.cliente,telefono:tel}},token,200,key);ok(copia._id===primero._id,'Clave y telefono normalizados recuperan el mismo pedido');
 const otra=await req('POST','/pedidos/telefonico',{...body,cliente:{...body.cliente,nombre:'Nombre que no reemplaza',telefono:tel,direccion:{...direccion,calle:'Calle Alternativa',comuna:'Providencia'}}},token,201,randomUUID());
 ok(otra.cliente.id_cliente===id && otra.cliente.nombre==='Maria Sin Cuenta','Reutiliza cliente sin cambiar su nombre');
 ok(otra.direccion_entrega.comuna==='Providencia','Comuna por nombre existente');
 assert.deepEqual((await sql('SELECT direccion_principal,id_comuna FROM Cliente WHERE id_cliente=:id',{id}))[0],['Calle Telefonica 123',1]);checks++;
 await req('POST','/pedidos/telefonico',{...body,guardar_como_principal:true,cliente:{...body.cliente,telefono:tel,direccion:{...direccion,calle:'Nueva Principal',comuna:2}}},token,201,randomUUID());
 assert.deepEqual((await sql('SELECT direccion_principal,id_comuna FROM Cliente WHERE id_cliente=:id',{id}))[0],['Nueva Principal 123',2]);checks++;
 const historial=await req('GET',`/pedidos/${primero._id}`,undefined,token);ok(historial.direccion_entrega.calle==='Calle Telefonica' && historial.cliente.telefono===tel,'Snapshot anterior intacto');
 const viejo={id_cliente:id,direccion_entrega:{calle:'Legado',numero:'5',id_comuna:1,referencia:''},metodo_cobro:'EFECTIVO',items:[{id_producto:producto.id_producto,cantidad:1}]};const keyVieja=randomUUID();
 await req('POST','/pedidos/telefonico',viejo,token,201,keyVieja);
 const hash=createHash('sha256').update(JSON.stringify({canal:'LLAMADA',...viejo})).digest('hex');ok((await sql('SELECT huella FROM Solicitud_Venta WHERE clave=:clave',{clave:keyVieja}))[0][0]===hash,'Conserva huella del contrato previo');
 const usuario=await req('POST','/auth/registro',{nombre:'Maria Web',telefono:`56${tel}`,email:`vinculo-${marca}@demo.test`,password:'VinculoDemo2026!',direccion_principal:'Casa Web 20',id_comuna:3},undefined,201);
 ok(usuario.usuario.id_cliente===id,'Registro vincula al Cliente sin cuenta');
 ok((await sql('SELECT COUNT(*) FROM Cliente WHERE telefono=:tel',{tel}))[0][0]===1,'No duplica al vincular');
 const sesion=await req('POST','/auth/login',{email:`vinculo-${marca}@demo.test`,password:'VinculoDemo2026!'});
 const mios=await req('GET','/pedidos/mios',undefined,sesion.token);ok(mios.some(p=>p._id===primero._id),'Nuevo usuario ve sus pedidos telefonicos anteriores');
 const doble=await req('POST','/auth/registro',{nombre:'Otra Persona',telefono:tel,email:`otro-vinculo-${marca}@demo.test`,password:'VinculoDemo2026!',direccion_principal:'No modificar',id_comuna:1},undefined,409);ok(doble.campos.telefono,'No vincula dos cuentas al mismo Cliente');
 const antes=(await sql('SELECT direccion_principal FROM Cliente WHERE id_cliente=:id',{id}))[0][0];
 await req('POST','/pedidos/telefonico',{...body,guardar_como_principal:true,items:[{id_producto:producto.id_producto,cantidad:9999}],cliente:{...body.cliente,telefono:tel,direccion:{...direccion,calle:'Rollback principal'}}},token,409);
 ok((await sql('SELECT direccion_principal FROM Cliente WHERE id_cliente=:id',{id}))[0][0]===antes,'Rollback de principal si falta stock');
 const telRollback=telefono();await req('POST','/pedidos/telefonico',{...body,cliente:{...body.cliente,telefono:telRollback},items:[{id_producto:producto.id_producto,cantidad:9999}]},token,409);
 ok((await sql('SELECT COUNT(*) FROM Cliente WHERE telefono=:tel',{tel:telRollback}))[0][0]===0,'Rollback de nuevo Cliente si falla venta');
 const concurrente=telefono();const resultados=await Promise.all(Array.from({length:4},(_,i)=>req('POST','/pedidos/telefonico',{...body,cliente:{...body.cliente,telefono:i%2?`+56 ${concurrente}`:concurrente},items:[{id_producto:producto.id_producto,cantidad:1}]},token,201,randomUUID())));
 ok(new Set(resultados.map(r=>r.cliente.id_cliente)).size===1,'Altas de pedidos concurrentes reutilizan un Cliente');
 const altas=await Promise.all([1,2].map(n=>fetch(base+'/auth/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:'Cliente Concurrente',telefono:concurrente,email:`concurrente-${marca}-${n}@demo.test`,password:'VinculoDemo2026!',direccion_principal:'Concurrente 10',id_comuna:1})})));
 assert.deepEqual(altas.map(r=>r.status).sort(),[201,409]);checks++;
 const mixto=telefono();const [a,b]=await Promise.all([req('POST','/pedidos/telefonico',{...body,cliente:{...body.cliente,telefono:mixto}},token,201,randomUUID()),req('POST','/auth/registro',{nombre:'Registro paralelo',telefono:mixto,email:`mixto-${marca}@demo.test`,password:'VinculoDemo2026!',direccion_principal:'Mixta 1',id_comuna:1},undefined,201)]);
 ok(a.cliente.id_cliente===b.usuario.id_cliente,'Registro y llamada simultaneos comparten cliente');
 await req('POST','/pedidos/telefonico',body,sesion.token,403);
 const reps=await req('GET','/repartidores?comuna=1',undefined,token);ok(reps[0].cubre_comuna,'Pedido listo para sugerencia por comuna');
 await req('POST','/sincronizacion/reintentar',undefined,token);
 const audit=await mongoDb.collection('eventos_auditoria').find({tipo:'PEDIDO_TELEFONICO','detalle.id_pedido':primero._id}).toArray();ok(audit.length===1 && audit[0].detalle.cliente_creado===true,'Evento telefonico unico y trazable');
 const vinculo=await mongoDb.collection('eventos_auditoria').countDocuments({tipo:'CLIENTE_VINCULADO_USUARIO','detalle.id_cliente':id});ok(vinculo===1,'Auditoria de vinculacion');
 console.log(`PEDIDO TELEFONICO OK: ${checks} comprobaciones.`);
}finally{await Promise.allSettled([oraclePool.close(0),mongoClient.close()]);}
