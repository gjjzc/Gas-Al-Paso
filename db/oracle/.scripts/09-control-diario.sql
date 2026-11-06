PROMPT 09 - Fecha de cobro y reintentos del control diario
DECLARE
    v_existe NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_existe FROM user_tab_columns WHERE table_name='VENTA' AND column_name='FECHA_COBRO';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE Venta ADD (fecha_cobro DATE)';
    END IF;
    SELECT COUNT(*) INTO v_existe FROM user_tables WHERE table_name='SOLICITUD_CONTROL';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE Solicitud_Control (
            id_usuario NUMBER NOT NULL REFERENCES Usuario(id_usuario),
            clave VARCHAR2(100) NOT NULL,
            tipo VARCHAR2(10) NOT NULL CHECK (tipo IN (''CARGA'',''CIERRE'')),
            huella VARCHAR2(64) NOT NULL,
            resultado CLOB NOT NULL CHECK (resultado IS JSON),
            creado_en TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT pk_solicitud_control PRIMARY KEY(id_usuario,clave)
        )';
    END IF;
    SELECT COUNT(*) INTO v_existe FROM user_indexes WHERE index_name='IX_VENTA_COBRO';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX ix_venta_cobro ON Venta(id_empleado,fecha_cobro,estado_pago)';
    END IF;
END;
/
-- No se reescriben ventas historicas. Las ya cobradas sin fecha usan fecha_venta
-- como aproximacion documentada; desde esta migracion se captura el cobro real.
CREATE OR REPLACE TRIGGER TrgFechaCobro
BEFORE INSERT OR UPDATE OF estado_pago ON Venta
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        IF :NEW.estado_pago='COBRADA' THEN :NEW.fecha_cobro := SYSDATE;
        ELSE :NEW.fecha_cobro := NULL; END IF;
    ELSIF :NEW.estado_pago='COBRADA' AND :OLD.estado_pago<>'COBRADA' THEN
        :NEW.fecha_cobro := SYSDATE;
    ELSE
        :NEW.fecha_cobro := :OLD.fecha_cobro;
    END IF;
END;
/
CREATE OR REPLACE FUNCTION TotalVendidoHoy RETURN NUMBER IS
    v_total NUMBER;
BEGIN
    SELECT NVL(SUM(total_venta),0) INTO v_total FROM Venta
    WHERE NVL(fecha_cobro,fecha_venta) >= TRUNC(SYSDATE) AND NVL(fecha_cobro,fecha_venta) < TRUNC(SYSDATE)+1
      AND estado_pago = 'COBRADA' AND estado_registro = 'CONFIRMADA';
    RETURN v_total;
END;
/
CREATE OR REPLACE PROCEDURE ResumenHoy IS
BEGIN
    DBMS_OUTPUT.PUT_LINE('VENTAS COBRADAS DEL DIA');
    FOR r IN (SELECT id_venta,total_venta FROM Venta
              WHERE NVL(fecha_cobro,fecha_venta) >= TRUNC(SYSDATE) AND NVL(fecha_cobro,fecha_venta) < TRUNC(SYSDATE)+1
                AND estado_pago = 'COBRADA' AND estado_registro = 'CONFIRMADA'
              ORDER BY id_venta) LOOP
        DBMS_OUTPUT.PUT_LINE('Venta ' || r.id_venta || ': $' || r.total_venta);
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('Total vendido: $' || TotalVendidoHoy);
END;
/
CREATE OR REPLACE PROCEDURE ResumenEmpleado(p_id_empleado NUMBER) IS
    v_nombre Empleado.nombre%TYPE;
    v_cantidad NUMBER;
    v_total NUMBER;
BEGIN
    SELECT nombre INTO v_nombre FROM Empleado WHERE id_empleado = p_id_empleado;
    SELECT COUNT(*),NVL(SUM(total_venta),0) INTO v_cantidad,v_total FROM Venta
    WHERE id_empleado = p_id_empleado AND estado_pago = 'COBRADA' AND estado_registro = 'CONFIRMADA'
      AND NVL(fecha_cobro,fecha_venta) >= TRUNC(SYSDATE) AND NVL(fecha_cobro,fecha_venta) < TRUNC(SYSDATE)+1;
    DBMS_OUTPUT.PUT_LINE(v_nombre || ': ' || v_cantidad || ' ventas cobradas; total $' || v_total);
EXCEPTION
    WHEN NO_DATA_FOUND THEN DBMS_OUTPUT.PUT_LINE('El empleado no existe');
END;
/
CREATE OR REPLACE VIEW V_Cuadratura_Dinero AS
SELECT id_empleado,TRUNC(NVL(fecha_cobro,fecha_venta)) fecha,COUNT(*) cantidad_ventas,
       SUM(subtotal) subtotal,SUM(descuento) descuento,SUM(total_venta) total_esperado,
       SUM(CASE WHEN metodo_pago = 'EFECTIVO' THEN total_venta ELSE 0 END) esperado_efectivo,
       SUM(CASE WHEN metodo_pago = 'TRANSFERENCIA' THEN total_venta ELSE 0 END) esperado_transferencia
FROM Venta WHERE estado_pago = 'COBRADA' AND estado_registro = 'CONFIRMADA'
GROUP BY id_empleado,TRUNC(NVL(fecha_cobro,fecha_venta));
CREATE OR REPLACE VIEW V_Cuadratura_Stock AS
WITH vendido AS (
    SELECT v.id_empleado,TRUNC(NVL(v.fecha_cobro,v.fecha_venta)) fecha,d.id_producto,SUM(d.cantidad) cantidad
    FROM Venta v JOIN Detalle_venta d ON d.id_venta = v.id_venta
    WHERE v.estado_pago = 'COBRADA' AND v.estado_registro = 'CONFIRMADA'
    GROUP BY v.id_empleado,TRUNC(NVL(v.fecha_cobro,v.fecha_venta)),d.id_producto
)
SELECT COALESCE(c.id_empleado,v.id_empleado) id_empleado,
       COALESCE(c.fecha,v.fecha) fecha,COALESCE(c.id_producto,v.id_producto) id_producto,
       NVL(c.cantidad_cargada,0) cargado,NVL(v.cantidad,0) vendido
FROM Carga_diaria c FULL OUTER JOIN vendido v
  ON c.id_empleado = v.id_empleado AND c.fecha = v.fecha AND c.id_producto = v.id_producto
JOIN Productos p ON p.id_producto = COALESCE(c.id_producto,v.id_producto)
WHERE p.peso IN (5,11,15,45);

BEGIN
    DBMS_UTILITY.COMPILE_SCHEMA(schema=>USER,compile_all=>FALSE);
END;
/
DECLARE
    v_invalidos NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_invalidos FROM user_objects WHERE status='INVALID';
    IF v_invalidos<>0 THEN RAISE_APPLICATION_ERROR(-20090,'Existen objetos invalidos despues de aplicar control diario'); END IF;
END;
/
COMMIT;
