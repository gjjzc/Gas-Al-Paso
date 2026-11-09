import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { mongoClient, mongoDb, oraclePool } from './src/config/databases.js';
const base='http://127.0.0.1:4000/api';let checks=0;
async function req(method,path,body,token,status=200){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),'Idempotency-Key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(d)}`);checks++;return d;}
function ok(cond,msg){assert.ok(cond,msg);checks++;}
try {
 const a=(await req('POST','/auth/login',{email:'admin@demo.gasalpaso.test',password:'GasPasoDemo2026!'})).token;
 const cliente=await req('POST','/auth/registro',{nombre:'Fotos Prueba',email:`fotos-${randomUUID()}@demo.test`,password:'FotosDemo2026!',telefono:`9${randomInt(10000000,89999999)}`,direccion_principal:'Fotos 12',id_comuna:1},undefined,201);
 const token=(await req('POST','/auth/login',{email:cliente.usuario.email,password:'FotosDemo2026!'})).token;
 const datos={nombre:`Fotos ${Date.now()}`,descripcion:'Prueba fotos locales',categoria:'GAS',peso:11,precio:15000,stock:50,imagen:'/productos/balon-11kg.png'};
 const p=await req('POST','/catalogo',datos,a,201);
 ok(p.imagen===datos.imagen,'Crear conserva ruta local');
 ok((await mongoDb.collection('catalogo').findOne({id_producto:p.id_producto})).imagen===datos.imagen,'Ruta persistida Mongo');
 for(const imagen of ['https://ejemplo.test/foto.jpg','//ejemplo.test/foto.jpg','data:image/svg+xml,x','/productos/../foto.jpg','/productos/foto.jpg?url=https://otro.test','/productos/a%2Ffoto.jpg']) await req('PUT',`/catalogo/${p.id_producto}`,{imagen},a,400);

 await req('PUT',`/catalogo/${p.id_producto}`,{imagen:'/productos/balon-11kg.jpg'},a);
 ok((await req('GET',`/catalogo/${p.id_producto}`,undefined,a)).imagen==='/productos/balon-11kg.png','Ruta JPG de primera entrega normalizada a PNG existente');
 const carrito=await req('POST','/carrito/items',{id_producto:p.id_producto,cantidad:2},token);
 ok(carrito.items[0].imagen===datos.imagen,'Carrito devuelve imagen');
 // Fixtures previas sin campo imagen: GET enriquece sin alterar version/cantidades.
 const doc=await mongoDb.collection('carritos').findOne({id_cliente:cliente.usuario.id_cliente});
 await mongoDb.collection('carritos').updateOne({_id:doc._id},{$unset:{'items.0.imagen':''}});
 const anterior=await req('GET','/carrito',undefined,token);
 ok(anterior.items[0].imagen===datos.imagen && anterior.version===carrito.version,'Carrito antiguo conserva version');
 const pedido=await req('POST','/pedidos',{direccion_entrega:{calle:'Fotos',numero:'12',id_comuna:1},metodo_cobro:'EFECTIVO'},token,201);
 ok(pedido.items[0].imagen===datos.imagen && pedido.total===27000,'Pedido fotografia y descuento sin cambios');
 ok((await mongoDb.collection('pedidos').findOne({id_venta:pedido.id_venta})).items[0].imagen===datos.imagen,'Instantanea foto guardada');
 await req('PUT',`/catalogo/${p.id_producto}`,{imagen:'/productos/otra.webp'},a);
 ok((await req('GET',`/pedidos/${pedido._id}`,undefined,a)).items[0].imagen===datos.imagen,'Pedido conserva instantanea tras editar catalogo');
 const vacio=await req('PUT',`/catalogo/${p.id_producto}`,{imagen:''},a);
 ok(vacio.imagen==='/llama.svg','Campo vacio usa SVG');
 await req('PUT',`/catalogo/${p.id_producto}`,{nombre:'Foto sin cambiar'},a);
 ok((await mongoDb.collection('catalogo').findOne({id_producto:p.id_producto})).imagen==='/llama.svg','Edicion parcial conserva ruta');
 await req('PATCH',`/pedidos/${pedido._id}/cancelar`,{},a);
 await req('DELETE',`/catalogo/${p.id_producto}`,undefined,a);
 console.log(`IMAGENES OK: ${checks} comprobaciones.`);
} finally {await Promise.allSettled([oraclePool.close(0),mongoClient.close()]);}
