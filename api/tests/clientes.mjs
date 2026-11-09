import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import {oraclePool,mongoClient,mongoDb} from './src/config/databases.js';
const base='http://127.0.0.1:4000/api';let checks=0;const tel=()=>`9${randomInt(10000000,89999999)}`;
async function req(method,path,body,token,status=200){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),'Idempotency-Key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,`${method} ${path.split('?')[0]}: ${JSON.stringify(d)}`);checks++;return d;}
async function sql(query,binds={}){const c=await oraclePool.getConnection();try{const r=await c.execute(query,binds);await c.commit();return r.rows;}finally{await c.close();}}
function ok(cond,mensaje){assert.ok(cond,mensaje);checks++;}
try{
 const admin=await req('POST','/auth/login',{email:'admin@demo.gasalpaso.test',password:'GasPasoDemo2026!'});const a=admin.token;
 const cli=await req('POST','/auth/login',{email:'ana@demo.gasalpaso.test',password:'GasPasoDemo2026!'});
 const rep=await req('POST','/auth/login',{email:'camila@demo.gasalpaso.test',password:'GasPasoDemo2026!'});
 for(const token of [undefined,cli.token,rep.token]){const status=token?403:401;await req('GET','/clientes?telefono=1234',undefined,token,status);await req('GET','/clientes/1',undefined,token,status);await req('PATCH','/clientes/1',{nombre:'No modificar'},token,status);}
 for(const t of ['123','abc1234','1234567890',"1' OR 1=1 --"]){const r=await req('GET',`/clientes?telefono=${encodeURIComponent(t)}`,undefined,a,400);ok(r.campos.telefono,'Validacion por campo');}
 await req('GET','/clientes',undefined,a,400);await req('GET','/clientes?telefono=1234&limite=99',undefined,a,400);await req('GET','/clientes/0',undefined,a,400);await req('GET','/clientes/999999999',undefined,a,404);
 const marca=Date.now();const telefono=tel();const p=await req('POST','/catalogo',{nombre:`Busqueda ${marca}`,descripcion:'Prueba clientes',categoria:'GAS',peso:11,precio:15000,stock:100},a,201);
 const cuerpo={cliente:{nombre:`Cliente Busqueda ${marca}`,telefono,direccion:{calle:'Principal Busqueda',numero:'12A',comuna:1,referencia:'Timbre azul'}},items:[{id_producto:p.id_producto,cantidad:1}],metodo_cobro:'EFECTIVO'};
 const primero=await req('POST','/pedidos/telefonico',cuerpo,a,201);const id=primero.cliente.id_cliente;
 await req('POST','/pedidos/telefonico',{...cuerpo,cliente:{...cuerpo.cliente,direccion:{...cuerpo.cliente.direccion,calle:'Otra Entrega',numero:'99'}}},a,201);
 const ficha=await req('GET',`/clientes/${id}`,undefined,a);ok(ficha.cantidad_pedidos===2 && ficha.pedidos_recientes.length===2,'Cantidad e historial');ok(ficha.fecha_ultimo_pedido,'Fecha de ultimo pedido');
 assert.deepEqual(ficha.direccion_entrega_sugerida,{calle:'Principal Busqueda',numero:'12A',id_comuna:1,comuna:'Santiago',referencia:'Timbre azul'});checks++;
 const resultados=await req('GET',`/clientes?telefono=${telefono.slice(-4)}`,undefined,a);ok(resultados.some(c=>c.id_cliente===id),'Ultimos cuatro digitos');
 const completos=await req('GET',`/clientes?telefono=${encodeURIComponent('+56 '+telefono)}`,undefined,a);ok(completos[0].id_cliente===id && completos[0].telefono===telefono && completos[0].cantidad_pedidos===2,'Telefono completo normalizado y datos de Oracle');
 for(let n=0;n<10;n++)await req('POST','/pedidos/telefonico',cuerpo,a,201);
 const historico=await req('GET',`/clientes/${id}`,undefined,a);ok(historico.cantidad_pedidos===12 && historico.pedidos_recientes.length===10,'Solo ultimos diez sin truncar contador');
 ok(historico.pedidos_recientes.every((p,i,arr)=>i===0 || new Date(arr[i-1].creado_en)>=new Date(p.creado_en)),'Orden descendente');
 await req('PATCH',`/clientes/${id}`,{},a,400);await req('PATCH',`/clientes/${id}`,{telefono:tel()},a,400);await req('PATCH',`/clientes/${id}`,{nombre:'X'},a,400);
 await req('PATCH',`/clientes/${id}`,{nombre:'No guardar',direccion_principal:{calle:'Falla',numero:'1',comuna:999999}},a,400);ok((await req('GET',`/clientes/${id}`,undefined,a)).nombre===cuerpo.cliente.nombre,'Rollback de parche invalido');
 const editado=await req('PATCH',`/clientes/${id}`,{nombre:"Maria O'Connor",direccion_principal:{calle:'Nueva Principal',numero:'450',comuna:2,referencia:'Departamento B'}},a);
 ok(editado.nombre==="Maria O'Connor" && editado.direccion_principal==='Nueva Principal 450' && editado.id_comuna===2,'PATCH con binds y direccion estructurada');
 const posterior=await req('GET',`/clientes/${id}`,undefined,a);ok(posterior.direccion_entrega_sugerida.numero==='450' && posterior.direccion_entrega_sugerida.referencia==='Departamento B','Precarga exacta tras corregir ficha');
 const snapshot=await req('GET',`/pedidos/${primero._id}`,undefined,a);ok(snapshot.cliente.nombre===cuerpo.cliente.nombre && snapshot.direccion_entrega.calle==='Principal Busqueda','Historial no se reescribe');
 await req('PATCH',`/clientes/${id}`,{nombre:'Nombre Corregido'},a);ok((await req('GET',`/clientes/${id}`,undefined,a)).direccion_entrega_sugerida.numero==='450','Cambiar solo nombre conserva calle y numero');
 // Direccion antigua como texto: recuperar solo si coincide realmente con un pedido.
 await req('PATCH',`/clientes/${id}`,{direccion_principal:'Principal Busqueda 12A',id_comuna:1},a);
 ok((await req('GET',`/clientes/${id}`,undefined,a)).direccion_entrega_sugerida.numero==='12A','Recuperacion de direccion previa sin adivinar');
 await req('PATCH',`/clientes/${id}`,{direccion_principal:'Direccion libre sin numero conocido',id_comuna:1},a);
 ok((await req('GET',`/clientes/${id}`,undefined,a)).direccion_entrega_sugerida===null,'No inventa numero de direccion antigua');
 // La asociacion del historial es por ID, no por telefono mutable del snapshot.
 const nuevoTel=tel();await sql('UPDATE Cliente SET telefono=:tel WHERE id_cliente=:id',{tel:nuevoTel,id});
 const renumerado=await req('GET',`/clientes?telefono=${nuevoTel}`,undefined,a);ok(renumerado[0].cantidad_pedidos===12,'Historial permanece al corregir telefono');
 // Mas de diez coincidencias sin Usuario ni pedidos.
 const sufijo=String(randomInt(1000,9999));const prefijo=randomInt(1000,8000);
 for(let n=0;n<12;n++)await sql("INSERT INTO Cliente(nombre,telefono,direccion_principal,id_comuna) VALUES(:nombre,:tel,'Sin pedidos 1',1)",{nombre:`Limite ${marca} ${n}`,tel:`9${String(prefijo+n).padStart(4,'0')}${sufijo}`});
 const limite=await req('GET',`/clientes?telefono=${sufijo}`,undefined,a);ok(limite.length===10 && limite.every(c=>c.telefono.includes(sufijo)),'Maximo 10 coincidencias parciales');
 const sinPedidos=limite.find(c=>c.nombre.startsWith(`Limite ${marca}`));ok(sinPedidos.cantidad_pedidos===0 && sinPedidos.fecha_ultimo_pedido===null,'Cero y null para contacto sin pedidos');
 const indices=await mongoDb.collection('pedidos').indexes();ok(indices.some(i=>i.key['cliente.id_cliente']===1 && i.key.creado_en===-1),'Indice de historial creado');
 const auditoria=await req('GET','/auditoria?tipo=CLIENTE_ACTUALIZADO',undefined,a);ok(auditoria.some(e=>e.detalle.id_cliente===id),'Correcciones auditadas');
 console.log(`BUSQUEDA CLIENTES OK: ${checks} comprobaciones.`);
}finally{await Promise.allSettled([oraclePool.close(0),mongoClient.close()]);}
