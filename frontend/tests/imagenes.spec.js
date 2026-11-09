import { test, expect } from '@playwright/test';
const foto = '/productos/producto-local.svg';
// Fixture sintética de integración: usa el SVG local existente, no incorpora fotos ni red externa.
async function preparar(page, rol='CLIENTE') {
  await page.addInitScript(() => sessionStorage.setItem('gas-al-paso.token','fotos-test'));
  await page.route('**/api/auth/me',r=>r.fulfill({json:{id_usuario:1,id_cliente:1,id_empleado:1,nombre:'Fotos Test',rol}}));
  await page.route('**/productos/producto-local.svg',r=>r.fulfill({path:'public/llama.svg',contentType:'image/svg+xml'}));
  await page.route('**/productos/falta.jpg',r=>r.fulfill({status:404,body:''}));
  await page.route('**/api/carrito',r=>r.fulfill({json:{items:[{id_producto:1,nombre:'Gas 11kg',cantidad:2,precio_unitario:15000,imagen:foto}],subtotal:30000,descuento:3000,total:27000}}));
}
const producto={id_producto:1,nombre:'Gas 11kg',descripcion:'Balon local',categoria:'GAS',peso:11,precio:15000,stock:20,activo:true,imagen:foto};
test('catalogo muestra foto local 4:3 y reemplazo sin cargar URL externa',async({page})=>{
 await preparar(page);
 const externas=[];page.on('request',r=>{if(r.url().includes('imagenes-externas.test'))externas.push(r.url());});
 await page.route('**/api/catalogo?**',r=>r.fulfill({json:[producto,{...producto,id_producto:2,nombre:'Foto fallida',imagen:'/productos/falta.jpg'},{...producto,id_producto:3,nombre:'Sin foto',imagen:''},{...producto,id_producto:4,nombre:'Antiguo externo',imagen:'https://imagenes-externas.test/x.jpg'}]}));
 await page.goto('/catalogo');
 const img=page.getByAltText('Foto de Gas 11kg');await img.scrollIntoViewIfNeeded();await expect(img).toBeVisible();
 await expect(img).toHaveAttribute('loading','lazy');await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
 const estilo=await img.evaluate(el=>({fit:getComputedStyle(el).objectFit,ratio:getComputedStyle(el.parentElement).aspectRatio,bg:getComputedStyle(el.parentElement).backgroundColor}));
 expect(estilo.fit).toBe('cover');expect(estilo.ratio).toBe('4 / 3');expect(estilo.bg).not.toBe('rgba(0, 0, 0, 0)');
 for(const nombre of ['Foto fallida','Sin foto','Antiguo externo'])await expect(page.getByRole('img',{name:`${nombre}: imagen de reemplazo`,exact:true})).toBeVisible();
 expect(externas).toHaveLength(0);
});
test('carrito y detalle de pedido muestran foto con nombre',async({page})=>{
 await preparar(page);
 await page.route('**/api/pedidos/abc',r=>r.fulfill({json:{_id:'abc',id_venta:5,estado:'RECIBIDO',creado_en:new Date().toISOString(),items:[{...producto,cantidad:2,precio_unitario:15000}],direccion_entrega:{calle:'Fotos',numero:'12',comuna:'Santiago'},historial_estados:[{estado:'RECIBIDO',fecha:new Date().toISOString()}],subtotal:30000,descuento:3000,total:27000}}));
 await page.goto('/carrito');await expect(page.getByAltText('Foto de Gas 11kg')).toBeVisible();
 await page.goto('/pedidos/abc');const fotoPedido=page.getByAltText('Foto de Gas 11kg');await fotoPedido.scrollIntoViewIfNeeded();await expect(fotoPedido).toBeVisible();
});
test('ADMIN muestra foto y vista previa editable; vacio/fallo recuperan SVG',async({page})=>{
 await preparar(page,'ADMIN');
 await page.route('**/api/catalogo?**',r=>r.fulfill({json:[producto]}));
 let recibido;
 await page.route('**/api/catalogo/1',r=>{recibido=r.request().postDataJSON();return r.fulfill({json:{...producto,...recibido,sincronizacion:'OK'}});});
 await page.goto('/admin/productos');await expect(page.getByAltText('Foto de Gas 11kg')).toBeVisible();
 await page.getByRole('button',{name:'Editar Gas 11kg'}).click();
 const campo=page.getByLabel('Imagen: ruta local');await expect(campo).toHaveValue(foto);
 const previa=page.locator('.vista-previa-producto');await expect(previa.locator('img')).toHaveAttribute('src',foto);
 await campo.fill('/productos/falta.jpg');await expect(previa.getByRole('img',{name:/imagen de reemplazo/})).toBeVisible();
 await campo.fill(foto);await expect(previa.locator('img')).toBeVisible();
 await campo.fill('');await expect(previa.getByRole('img',{name:/imagen de reemplazo/})).toBeVisible();
 await page.getByRole('button',{name:'Guardar producto',exact:true}).click();await expect.poll(()=>recibido?.imagen).toBe('');
});
test('ADMIN y REPARTIDOR muestran fotos en los detalles de pedidos',async({page})=>{
 const pedido={_id:'abc',id_venta:5,estado:'ASIGNADO',canal:'WEB',cliente:{nombre:'Cliente Fotos',telefono:'912345678'},creado_en:new Date().toISOString(),items:[{...producto,cantidad:2,precio_unitario:15000}],direccion_entrega:{calle:'Fotos',numero:'12',comuna:'Santiago',id_comuna:1},historial_estados:[{estado:'ASIGNADO',fecha:new Date().toISOString()}],subtotal:30000,descuento:3000,total:27000,metodo_cobro:'EFECTIVO',estado_pago:'PENDIENTE'};
 await preparar(page,'ADMIN');
 await page.route('**/api/pedidos/abc',r=>r.fulfill({json:pedido}));
 await page.goto('/admin/pedidos/abc');const img=page.getByAltText('Foto de Gas 11kg');await img.scrollIntoViewIfNeeded();await expect(img).toBeVisible();
 await preparar(page,'REPARTIDOR');
 await page.route('**/api/pedidos/asignados?**',r=>r.fulfill({json:[pedido]}));
 await page.goto('/repartidor/pedidos');await page.getByText('Productos e historial',{exact:true}).click();await expect(page.getByAltText('Foto de Gas 11kg')).toBeVisible();
});
