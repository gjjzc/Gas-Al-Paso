import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const archivos=JSON.parse(readFileSync(new URL('../../docs/imagenes-productos.json',import.meta.url),'utf8'));
const nombres=['Gas 5kg','Gas 11kg','Gas 15kg','Gas 45kg','Regulador de gas','Manguera de gas'];
const productos=archivos.map((a,i)=>({id_producto:i+1,nombre:nombres[i],descripcion:'Producto de demostración',categoria:i<4?'GAS':'ACCESORIO',peso:[5,11,15,45,1,1][i],stock:20,precio:[8000,15000,20000,60000,4000,2000][i],activo:true,imagen:`/productos/${a.archivo}`}));
async function apiDemo(page,rol='CLIENTE') {
 await page.addInitScript(()=>sessionStorage.setItem('gas-al-paso.token','fotos-locales-test'));
 await page.route('**/api/auth/me',r=>r.fulfill({json:{id_usuario:1,id_cliente:1,id_empleado:1,nombre:'Prueba Fotos',rol}}));
 await page.route('**/api/catalogo?**',r=>r.fulfill({json:productos}));
 await page.route('**/api/carrito',r=>r.fulfill({json:{items:productos.map(p=>({...p,cantidad:1,precio_unitario:p.precio})),subtotal:90000,descuento:9000,total:81000}}));
}
async function comprobarFotos(page) {
 for (const p of productos) {
  const img=page.getByAltText(`Foto de ${p.nombre}`,{exact:true});
  await img.scrollIntoViewIfNeeded();
  await expect.poll(()=>img.evaluate(el=>el.complete && el.naturalWidth>0)).toBe(true);
  await expect(img).toHaveAttribute('src',p.imagen);
  await expect(img).toHaveAttribute('loading','lazy');
  const tamano=await img.evaluate(el=>{const r=el.getBoundingClientRect();return{w:r.width,h:r.height,fit:getComputedStyle(el).objectFit};});
  expect(tamano.w/tamano.h).toBeCloseTo(4/3,1);expect(tamano.fit).toBe('cover');
 }
}
test('seis archivos reales locales, creditos y catalogo profesional sin solicitudes externas',async({page})=>{
 await apiDemo(page);
 const externas=[];page.on('request',r=>{if(!r.url().startsWith(new URL(process.env.E2E_BASE_URL || 'http://localhost:3000').origin)&&r.url().startsWith('http'))externas.push(r.url());});
 await page.goto('/catalogo');await comprobarFotos(page);
 expect(externas).toEqual([]);
 await page.locator('#productos').screenshot({style:'.saltar:not(:focus) { visibility: hidden; }',path:process.env.CAPTURA_CATALOGO || test.info().outputPath('catalogo-productos.png')});
 await page.getByRole('link',{name:'Créditos de imágenes'}).click();
 await expect(page.getByRole('heading',{name:'Créditos de imágenes'})).toBeVisible();
 await expect(page.locator('tbody tr')).toHaveCount(6);
 for(const a of archivos) await expect(page.getByText(a.archivo,{exact:true})).toBeVisible();
});
test('fotos finales en carrito, pedido y vista previa ADMIN; un producto sin foto mantiene reemplazo',async({page})=>{
 await apiDemo(page);
 await page.goto('/carrito');await comprobarFotos(page);
 const pedido={_id:'foto-real',id_venta:1,estado:'ASIGNADO',items:productos.map(p=>({...p,cantidad:1,precio_unitario:p.precio})),historial_estados:[{estado:'ASIGNADO',fecha:new Date().toISOString()}],direccion_entrega:{calle:'Ejemplo',numero:'12',comuna:'Santiago'},subtotal:90000,descuento:9000,total:81000};
 await page.route('**/api/pedidos/foto-real',r=>r.fulfill({json:pedido}));
 await page.goto('/pedidos/foto-real');await comprobarFotos(page);
 await apiDemo(page,'ADMIN');await page.goto('/admin/productos');await comprobarFotos(page);
 await page.getByRole('button',{name:'Editar Gas 11kg'}).click();
 const previa=page.locator('.vista-previa-producto img');await previa.scrollIntoViewIfNeeded();await expect.poll(()=>previa.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
 await page.getByLabel('Imagen: ruta local').fill('/productos/inexistente.png');await expect(page.locator('.vista-previa-producto').getByRole('img',{name:/imagen de reemplazo/})).toBeVisible();
});
test('catalogo movil sin desbordamiento con las seis imagenes finales',async({page})=>{
 await page.setViewportSize({width:390,height:844});await apiDemo(page);await page.goto('/catalogo');await comprobarFotos(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#productos').screenshot({style:'.saltar:not(:focus) { visibility: hidden; }',path:process.env.CAPTURA_CATALOGO_MOVIL || test.info().outputPath('catalogo-productos-movil.png')});
});
test('catalogo con API y bases reales devuelve y sirve las seis imagenes profesionales',async({page,request})=>{
 test.skip(!process.env.E2E_REAL,'Activar E2E_REAL=1 y usar frontend conectado a bases demo.');
 for (const p of productos) {
  const r=await request.get(`/api/catalogo/${p.id_producto}`);expect(r.ok()).toBe(true);
  expect((await r.json()).imagen).toBe(p.imagen);
  const f=await request.get(p.imagen);expect(f.ok()).toBe(true);expect(f.headers()['content-type']).toContain('image/png');
 }
 await page.goto('/catalogo');await comprobarFotos(page);
});
