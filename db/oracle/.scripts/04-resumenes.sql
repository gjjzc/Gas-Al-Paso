PROMPT 04 - Resumenes de ventas cobradas y control diario
CREATE OR REPLACE FUNCTION TotalVendidoHoy RETURN NUMBER IS
    v_total NUMBER;
BEGIN
    SELECT NVL(SUM(total_venta),0) INTO v_total FROM Venta
    WHERE fecha_venta >= TRUNC(SYSDATE) AND fecha_venta < TRUNC(SYSDATE)+1
      AND estado_pago = 'COBRADA' AND estado_registro = 'CONFIRMADA';
    RETURN v_total;
END;
/
CREATE OR REPLACE PROCEDURE ResumenHoy IS
BEGIN
    DBMS_OUTPUT.PUT_LINE('VENTAS COBRADAS DEL DIA');
    FOR r IN (SELECT id_venta,total_venta FROM Venta
              WHERE fecha_venta >= TRUNC(SYSDATE) AND fecha_venta < TRUNC(SYSDATE)+1
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
      AND fecha_venta >= TRUNC(SYSDATE) AND fecha_venta < TRUNC(SYSDATE)+1;
    DBMS_OUTPUT.PUT_LINE(v_nombre || ': ' || v_cantidad || ' ventas cobradas; total $' || v_total);
EXCEPTION
    WHEN NO_DATA_FOUND THEN DBMS_OUTPUT.PUT_LINE('El empleado no existe');
END;
/
CREATE OR REPLACE VIEW V_Cuadratura_Dinero AS
SELECT id_empleado,TRUNC(fecha_venta) fecha,COUNT(*) cantidad_ventas,
       SUM(subtotal) subtotal,SUM(descuento) descuento,SUM(total_venta) total_esperado,
       SUM(CASE WHEN metodo_pago = 'EFECTIVO' THEN total_venta ELSE 0 END) esperado_efectivo,
       SUM(CASE WHEN metodo_pago = 'TRANSFERENCIA' THEN total_venta ELSE 0 END) esperado_transferencia
FROM Venta WHERE estado_pago = 'COBRADA' AND estado_registro = 'CONFIRMADA'
GROUP BY id_empleado,TRUNC(fecha_venta);
CREATE OR REPLACE VIEW V_Cuadratura_Stock AS
WITH vendido AS (
    SELECT v.id_empleado,TRUNC(v.fecha_venta) fecha,d.id_producto,SUM(d.cantidad) cantidad
    FROM Venta v JOIN Detalle_venta d ON d.id_venta = v.id_venta
    WHERE v.estado_pago = 'COBRADA' AND v.estado_registro = 'CONFIRMADA'
    GROUP BY v.id_empleado,TRUNC(v.fecha_venta),d.id_producto
)
SELECT COALESCE(c.id_empleado,v.id_empleado) id_empleado,
       COALESCE(c.fecha,v.fecha) fecha,COALESCE(c.id_producto,v.id_producto) id_producto,
       NVL(c.cantidad_cargada,0) cargado,NVL(v.cantidad,0) vendido
FROM Carga_diaria c FULL OUTER JOIN vendido v
  ON c.id_empleado = v.id_empleado AND c.fecha = v.fecha AND c.id_producto = v.id_producto
JOIN Productos p ON p.id_producto = COALESCE(c.id_producto,v.id_producto)
WHERE p.peso IN (5,11,15,45);
