WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET SERVEROUTPUT ON DEFINE OFF
DECLARE
    v_venta NUMBER;
    v_subtotal NUMBER;
    v_descuento NUMBER;
    v_total NUMBER;
    v_stock NUMBER;
    v_stock2 NUMBER;
    v_estado VARCHAR2(10);
    v_cantidad NUMBER;
    v_checks NUMBER := 0;
    PROCEDURE Comprobar(p_ok BOOLEAN,p_texto VARCHAR2) IS
    BEGIN
        IF p_ok IS NULL OR NOT p_ok THEN RAISE_APPLICATION_ERROR(-20990,p_texto); END IF;
        v_checks := v_checks+1;
    END;
    PROCEDURE Rechazar(p_sql VARCHAR2,p_codigo NUMBER) IS
    BEGIN
        BEGIN
            EXECUTE IMMEDIATE p_sql;
        EXCEPTION
            WHEN OTHERS THEN
                IF SQLCODE = p_codigo THEN v_checks := v_checks+1; RETURN; END IF;
                RAISE;
        END;
        RAISE_APPLICATION_ERROR(-20991,'Debia rechazarse: ' || SUBSTR(p_sql,1,100));
    END;
BEGIN
    SAVEPOINT inicio_pruebas_fase1;
    Comprobar(CalcularDescuento(29999)=0,'No descontar debajo del umbral');
    Comprobar(CalcularDescuento(30000)=3000,'Descontar en el umbral exacto');
    SELECT subtotal,descuento,total_venta INTO v_subtotal,v_descuento,v_total FROM Venta WHERE id_venta=1;
    Comprobar(v_subtotal=30000 AND v_descuento=3000 AND v_total=27000,'Venta semilla 1');
    SELECT SUM(total_venta) INTO v_total FROM Detalle_venta WHERE id_venta=2;
    Comprobar(v_total=24000,'Totales de detalles semilla 2');
    SELECT COUNT(*) INTO v_cantidad FROM user_objects WHERE status='INVALID';
    Comprobar(v_cantidad=0,'Todos los objetos deben compilar');
    SELECT stock INTO v_stock FROM Productos WHERE id_producto=2;
    Comprobar(v_stock=38,'Stock de semilla y rollback de legacy');
    PkgVentas.CrearVenta(1,'WEB',3,NULL,NULL,v_venta);
    PkgVentas.AgregarItem(v_venta,2,1);
    PkgVentas.AgregarItem(v_venta,3,1);
    PkgVentas.FinalizarVenta(v_venta);
    SELECT subtotal,descuento,total_venta INTO v_subtotal,v_descuento,v_total FROM Venta WHERE id_venta=v_venta;
    Comprobar(v_subtotal=35000 AND v_descuento=3500 AND v_total=31500,'Descuento sobre varias lineas');
    SELECT SUM(total_venta),SUM(descuento) INTO v_total,v_descuento FROM Detalle_venta WHERE id_venta=v_venta;
    Comprobar(v_total=31500 AND v_descuento=3500,'Prorrateo coincide con cabecera');
    SELECT stock INTO v_stock2 FROM Productos WHERE id_producto=2;
    Comprobar(v_stock2=v_stock-1,'El trigger descuenta stock');
    Rechazar('UPDATE Venta SET subtotal=subtotal+1,total_venta=total_venta+1 WHERE id_venta='||v_venta,-20004);
    Rechazar('UPDATE Venta SET estado_pago=''ANULADA'' WHERE id_venta='||v_venta,-20004);
    Rechazar('DELETE FROM Venta WHERE id_venta='||v_venta,-20004);
    Rechazar('UPDATE Detalle_venta SET cantidad=99 WHERE id_venta='||v_venta,-20004);
    Rechazar('DELETE FROM Detalle_venta WHERE id_venta='||v_venta,-20004);
    Rechazar('BEGIN PkgVentas.AgregarItem('||v_venta||',1,1); END;',-20014);
    Rechazar('BEGIN PkgVentas.FinalizarVenta('||v_venta||'); END;',-20014);
    Rechazar('BEGIN PkgVentas.CobrarVenta('||v_venta||',NULL); END;',-20011);
    PkgVentas.AsignarRepartidor(v_venta,2);
    SELECT id_empleado INTO v_cantidad FROM Venta WHERE id_venta=v_venta;
    Comprobar(v_cantidad=2,'Asignacion controlada');
    PkgVentas.CobrarVenta(v_venta,'TRANSFERENCIA');
    PkgVentas.CobrarVenta(v_venta,'TRANSFERENCIA');
    SELECT estado_pago INTO v_estado FROM Venta WHERE id_venta=v_venta;
    Comprobar(v_estado='COBRADA','Cobro idempotente');
    Rechazar('BEGIN PkgVentas.CobrarVenta('||v_venta||',''EFECTIVO''); END;',-20015);
    AnularVenta(v_venta);
    AnularVenta(v_venta);
    SELECT stock INTO v_stock2 FROM Productos WHERE id_producto=2;
    Comprobar(v_stock2=v_stock,'Anular devuelve stock exactamente una vez');
    SELECT estado_pago,total_venta INTO v_estado,v_total FROM Venta WHERE id_venta=v_venta;
    Comprobar(v_estado='ANULADA' AND v_total=31500,'Anular conserva importes');
    SELECT COUNT(*) INTO v_cantidad FROM Detalle_venta WHERE id_venta=v_venta;
    Comprobar(v_cantidad=2,'Anular conserva detalles');
    Comprobar(TotalVendidoHoy=16000,'Los resumenes excluyen anuladas y pendientes');
    PkgVentas.CrearVenta(1,'LLAMADA',3,'EFECTIVO',NULL,v_venta);
    Rechazar('BEGIN PkgVentas.FinalizarVenta('||v_venta||'); END;',-20006);
    Rechazar('BEGIN PkgVentas.AgregarItem('||v_venta||',2,0); END;',-20001);
    Rechazar('BEGIN PkgVentas.AgregarItem('||v_venta||',2,1.5); END;',-20001);
    Rechazar('BEGIN PkgVentas.AgregarItem('||v_venta||',2,NULL); END;',-20001);
    Rechazar('BEGIN PkgVentas.AgregarItem('||v_venta||',2,9999); END;',-20003);
    Comprobar(PkgVentas.OperacionPermitida IS NULL,'La autorizacion interna se limpia tras fallos');
    SELECT stock INTO v_stock2 FROM Productos WHERE id_producto=2;
    Comprobar(v_stock2=v_stock,'Rechazo por stock no modifica existencias');
    UPDATE Productos SET activo=0 WHERE id_producto=6;
    Rechazar('BEGIN PkgVentas.AgregarItem('||v_venta||',6,1); END;',100);
    UPDATE Productos SET activo=1 WHERE id_producto=6;
    SELECT stock INTO v_stock FROM Productos WHERE id_producto=1;
    INSERT INTO Carga_diaria(id_empleado,id_producto,cantidad_cargada) VALUES(1,1,100);
    SELECT stock INTO v_stock2 FROM Productos WHERE id_producto=1;
    Comprobar(v_stock=v_stock2,'Cargar balones no modifica stock total');
    SELECT COUNT(*) INTO v_cantidad FROM Auditoria_Precio WHERE id_producto=6;
    UPDATE Productos SET valor_unitario=3500 WHERE id_producto=6;
    SELECT COUNT(*) INTO v_stock2 FROM Auditoria_Precio WHERE id_producto=6;
    Comprobar(v_stock2=v_cantidad+1,'Auditoria de cambio de precio');
    SELECT total_esperado INTO v_total FROM V_Cuadratura_Dinero WHERE id_empleado=3 AND fecha=TRUNC(SYSDATE);
    Comprobar(v_total=16000,'Cuadratura de dinero');
    SELECT cargado,vendido INTO v_stock,v_stock2 FROM V_Cuadratura_Stock
    WHERE id_empleado=3 AND id_producto=1 AND fecha=TRUNC(SYSDATE);
    Comprobar(v_stock=8 AND v_stock2=2,'Cuadratura de balones');
    ROLLBACK TO inicio_pruebas_fase1;
    DBMS_OUTPUT.PUT_LINE('PRUEBAS FASE 1 OK: '||v_checks||' comprobaciones; sin cambios persistentes');
EXCEPTION
    WHEN OTHERS THEN ROLLBACK TO inicio_pruebas_fase1; RAISE;
END;
/
EXIT SUCCESS
