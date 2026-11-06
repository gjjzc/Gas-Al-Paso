PROMPT 06 - Comprobando la instalacion
-- ALTER TABLE invalida dependencias legacy aunque su codigo siga siendo valido.
BEGIN
    DBMS_UTILITY.COMPILE_SCHEMA(schema => USER,compile_all => FALSE);
END;
/
DECLARE
    v_errores NUMBER;
    v_total NUMBER;
    PROCEDURE Verificar(p_actual NUMBER,p_esperado NUMBER,p_mensaje VARCHAR2) IS
    BEGIN
        IF p_actual <> p_esperado THEN RAISE_APPLICATION_ERROR(-20090,p_mensaje); END IF;
    END;
BEGIN
    SELECT COUNT(*) INTO v_errores FROM user_objects WHERE status = 'INVALID';
    Verificar(v_errores,0,'Existen objetos Oracle invalidos');
    SELECT COUNT(*) INTO v_total FROM Tienda; Verificar(v_total,1,'Debe existir una sucursal');
    SELECT COUNT(*) INTO v_total FROM Comuna; Verificar(v_total,8,'Deben existir ocho comunas');
    SELECT COUNT(*) INTO v_total FROM Usuario WHERE rol = 'ADMIN'; Verificar(v_total,1,'Falta admin');
    SELECT COUNT(*) INTO v_total FROM Usuario WHERE rol = 'REPARTIDOR'; Verificar(v_total,2,'Faltan repartidores');
    SELECT COUNT(*) INTO v_total FROM Usuario WHERE rol = 'CLIENTE'; Verificar(v_total,3,'Faltan clientes');
    SELECT COUNT(*) INTO v_total FROM Productos; Verificar(v_total,6,'Faltan productos');
    SELECT COUNT(*) INTO v_total FROM Venta WHERE estado_registro = 'CONFIRMADA';
    Verificar(v_total,3,'Faltan ventas de demostracion');
    SELECT COUNT(*) INTO v_total FROM Venta WHERE total_venta <> subtotal-descuento;
    Verificar(v_total,0,'Los totales no coinciden');
    SELECT TotalVendidoHoy INTO v_total FROM DUAL; Verificar(v_total,16000,'Total cobrado incorrecto');
    DBMS_OUTPUT.PUT_LINE('FASE 1: esquema, objetos compilados y datos de ejemplo OK');
END;
/
COMMIT;
