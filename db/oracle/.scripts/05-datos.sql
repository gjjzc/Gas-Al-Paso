PROMPT 05 - Datos ficticios de desarrollo
-- Una sucursal. Se conserva el SQL legacy intacto y se adapta su semilla aqui.
UPDATE Empleado SET id_tienda = 1;
DELETE FROM Tienda WHERE id_tienda <> 1;
UPDATE Tienda SET nombre_tienda = 'Gas al Paso' WHERE id_tienda = 1;
UPDATE Empleado SET nombre = 'Administracion Demo' WHERE id_empleado = 1;
UPDATE Empleado SET nombre = 'Camila Soto' WHERE id_empleado = 2;
INSERT INTO Empleado(id_empleado,nombre,id_tienda) VALUES(3,'Diego Rojas',1);
INSERT INTO Comuna(nombre) VALUES('Santiago');
INSERT INTO Comuna(nombre) VALUES('Providencia');
INSERT INTO Comuna(nombre) VALUES('Ñuñoa');
INSERT INTO Comuna(nombre) VALUES('La Florida');
INSERT INTO Comuna(nombre) VALUES('Maipu');
INSERT INTO Comuna(nombre) VALUES('Puente Alto');
INSERT INTO Comuna(nombre) VALUES('San Miguel');
INSERT INTO Comuna(nombre) VALUES('La Cisterna');
INSERT INTO Repartidor_Comuna VALUES(2,1);
INSERT INTO Repartidor_Comuna VALUES(2,2);
INSERT INTO Repartidor_Comuna VALUES(2,3);
INSERT INTO Repartidor_Comuna VALUES(2,7);
INSERT INTO Repartidor_Comuna VALUES(3,4);
INSERT INTO Repartidor_Comuna VALUES(3,5);
INSERT INTO Repartidor_Comuna VALUES(3,6);
INSERT INTO Repartidor_Comuna VALUES(3,8);
INSERT INTO Cliente(nombre,telefono,direccion_principal,id_comuna)
VALUES('Ana Demo','+56900000001','Calle Ejemplo 100',1);
INSERT INTO Cliente(nombre,telefono,direccion_principal,id_comuna)
VALUES('Bruno Demo','+56900000002','Calle Ejemplo 200',4);
INSERT INTO Cliente(nombre,telefono,direccion_principal,id_comuna)
VALUES('Carla Demo','+56900000003','Calle Ejemplo 300',5);
INSERT INTO Usuario(email,password_hash,rol,id_empleado,id_cliente) VALUES('admin@demo.gasalpaso.test','$2b$12$F/7aRQ9Y1fZDl8huwIQ1COEjGssWnI.xmXx0f2fP.6S7STXEi7l/O','ADMIN',1,NULL);
INSERT INTO Usuario(email,password_hash,rol,id_empleado,id_cliente) VALUES('camila@demo.gasalpaso.test','$2b$12$AfseoNWv59lOBFWj3Qt37eGei.cMqf3NNAVPr1qA5Q.h8rRIQmr9a','REPARTIDOR',2,NULL);
INSERT INTO Usuario(email,password_hash,rol,id_empleado,id_cliente) VALUES('diego@demo.gasalpaso.test','$2b$12$fERVgZQc534vdmntd4mj5up4f.U8pbsLOinIr3BYQwN7wb7yL2MPu','REPARTIDOR',3,NULL);
INSERT INTO Usuario(email,password_hash,rol,id_empleado,id_cliente) VALUES('ana@demo.gasalpaso.test','$2b$12$zjCORiGBTdlJ3me7/oNWEeGgMBOZul7SjmBJNvDhMvRYC.xPYXukq','CLIENTE',NULL,1);
INSERT INTO Usuario(email,password_hash,rol,id_empleado,id_cliente) VALUES('bruno@demo.gasalpaso.test','$2b$12$Q2oF.cBxXj7rlBUksuaTl./it9FC1PzhJYtsZ0iDJ6zgPkmHJwpRO','CLIENTE',NULL,2);
INSERT INTO Usuario(email,password_hash,rol,id_empleado,id_cliente) VALUES('carla@demo.gasalpaso.test','$2b$12$M6X6RsnC4.m0SXcgdcyC3eWEHffSxKCE7FAYa3MN9nPOSUxIJlcmi','CLIENTE',NULL,3);
-- Asegurar identidad futura > maximo de IDs para entidades cargadas con ID explicito.
INSERT INTO Productos(id_producto,nombre,descripcion,peso,valor_unitario,stock,activo)
VALUES(6,'Manguera de gas','Manguera de conexion de ejemplo',0.2,3000,80,1);
UPDATE Productos SET stock = CASE id_producto WHEN 1 THEN 50 WHEN 2 THEN 40
    WHEN 3 THEN 30 WHEN 4 THEN 15 WHEN 5 THEN 100 WHEN 6 THEN 80 END;
-- Las pruebas legacy consumen secuencias aunque hagan rollback. Sin ventas persistidas,
-- reiniciamos para que Oracle y Mongo compartan los IDs de estas fixtures.
ALTER SEQUENCE seq_venta RESTART START WITH 1;
ALTER SEQUENCE seq_detalle_venta RESTART START WITH 1;
DECLARE
    v_id NUMBER;
BEGIN
    PkgVentas.CrearVenta(2,'WEB',1,'EFECTIVO','650000000000000000000001',v_id);
    PkgVentas.AgregarItem(v_id,2,2);
    PkgVentas.FinalizarVenta(v_id);
    PkgVentas.CrearVenta(1,'LLAMADA',2,'TRANSFERENCIA','650000000000000000000002',v_id);
    PkgVentas.AgregarItem(v_id,3,1);
    PkgVentas.AgregarItem(v_id,5,1);
    PkgVentas.FinalizarVenta(v_id);
    PkgVentas.RegistrarVenta(3,1,2,v_id);
END;
/
-- Las cargas NO afectan Productos.stock.
INSERT INTO Carga_diaria(id_empleado,id_producto,cantidad_cargada) VALUES(2,1,5);
INSERT INTO Carga_diaria(id_empleado,id_producto,cantidad_cargada) VALUES(2,2,6);
INSERT INTO Carga_diaria(id_empleado,id_producto,cantidad_cargada) VALUES(3,1,8);
INSERT INTO Carga_diaria(id_empleado,id_producto,cantidad_cargada) VALUES(3,4,2);
INSERT INTO Cierre_caja(id_empleado,total_esperado,monto_entregado,diferencia,observacion,
    esperado_efectivo,esperado_transferencia,entregado_efectivo,entregado_transferencia)
VALUES(3,16000,16000,0,'Cierre ficticio de demostracion',16000,0,16000,0);
INSERT INTO Cierre_stock VALUES(1,1,8,2,6,0);
INSERT INTO Cierre_stock VALUES(1,4,2,0,2,0);
COMMIT;
