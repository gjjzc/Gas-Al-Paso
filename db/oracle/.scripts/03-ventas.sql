PROMPT 03 - Ventas de varias lineas y proteccion de ventas confirmadas
CREATE OR REPLACE PACKAGE PkgVentas IS
    -- Solo consulta: no existe un setter publico para desactivar los triggers.
    FUNCTION OperacionPermitida RETURN VARCHAR2;
    PROCEDURE ValidarDatos(p_id_empleado NUMBER, p_id_producto NUMBER, p_cantidad NUMBER,
        p_id_tienda OUT NUMBER, p_precio OUT NUMBER);
    PROCEDURE CrearVenta(p_id_empleado NUMBER, p_canal VARCHAR2, p_id_cliente NUMBER,
        p_metodo_pago VARCHAR2, p_id_pedido_mongo VARCHAR2, p_id_venta OUT NUMBER);
    PROCEDURE AgregarItem(p_id_venta NUMBER, p_id_producto NUMBER, p_cantidad NUMBER);
    PROCEDURE FinalizarVenta(p_id_venta NUMBER);
    PROCEDURE RegistrarVenta(p_id_empleado NUMBER, p_id_producto NUMBER,
        p_cantidad NUMBER, p_id_venta OUT NUMBER);
    PROCEDURE AnularVenta(p_id_venta NUMBER);
    PROCEDURE CobrarVenta(p_id_venta NUMBER, p_metodo_pago VARCHAR2);
    PROCEDURE AsignarRepartidor(p_id_venta NUMBER, p_id_empleado NUMBER);
END PkgVentas;
/
CREATE OR REPLACE PACKAGE BODY PkgVentas IS
    g_operacion VARCHAR2(15);
    FUNCTION OperacionPermitida RETURN VARCHAR2 IS
    BEGIN
        RETURN g_operacion;
    END;

    PROCEDURE ValidarDatos(p_id_empleado NUMBER, p_id_producto NUMBER, p_cantidad NUMBER,
        p_id_tienda OUT NUMBER, p_precio OUT NUMBER) IS
    BEGIN
        IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad <> TRUNC(p_cantidad) THEN
            RAISE_APPLICATION_ERROR(-20001, 'La cantidad debe ser un entero mayor que cero');
        END IF;
        SELECT id_tienda INTO p_id_tienda FROM Empleado WHERE id_empleado = p_id_empleado;
        SELECT valor_unitario INTO p_precio FROM Productos
        WHERE id_producto = p_id_producto AND activo = 1;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20005, 'No existe el empleado o el producto activo indicado');
    END;

    PROCEDURE CrearVenta(p_id_empleado NUMBER, p_canal VARCHAR2, p_id_cliente NUMBER,
        p_metodo_pago VARCHAR2, p_id_pedido_mongo VARCHAR2, p_id_venta OUT NUMBER) IS
        v_tienda NUMBER;
        v_existe NUMBER;
    BEGIN
        IF p_canal IS NULL OR p_canal NOT IN ('WEB','LLAMADA','TARREO') THEN
            RAISE_APPLICATION_ERROR(-20010, 'Canal de venta invalido');
        END IF;
        IF p_metodo_pago IS NOT NULL AND p_metodo_pago NOT IN ('EFECTIVO','TRANSFERENCIA') THEN
            RAISE_APPLICATION_ERROR(-20011, 'Metodo de pago invalido');
        END IF;
        IF p_canal = 'TARREO' THEN
            IF p_metodo_pago IS NULL OR p_id_cliente IS NOT NULL OR p_id_pedido_mongo IS NOT NULL THEN
                RAISE_APPLICATION_ERROR(-20011, 'Tarreo requiere metodo de pago y no admite cliente ni pedido');
            END IF;
            SELECT COUNT(*) INTO v_existe FROM Usuario
            WHERE id_empleado = p_id_empleado AND rol = 'REPARTIDOR' AND activo = 1;
            IF v_existe = 0 THEN
                RAISE_APPLICATION_ERROR(-20012, 'Tarreo requiere un repartidor activo');
            END IF;
        ELSIF p_id_cliente IS NULL THEN
            RAISE_APPLICATION_ERROR(-20013, 'WEB y LLAMADA requieren cliente');
        END IF;
        SELECT id_tienda INTO v_tienda FROM Empleado WHERE id_empleado = p_id_empleado;
        p_id_venta := seq_venta.NEXTVAL;
        g_operacion := 'CREAR';
        INSERT INTO Venta(id_venta,fecha_venta,id_empleado,id_tienda,subtotal,descuento,total_venta,
            canal,id_cliente,estado_pago,metodo_pago,id_pedido_mongo,estado_registro)
        VALUES(p_id_venta,SYSDATE,p_id_empleado,v_tienda,0,0,0,p_canal,p_id_cliente,
            CASE WHEN p_canal = 'TARREO' THEN 'COBRADA' ELSE 'PENDIENTE' END,
            p_metodo_pago,p_id_pedido_mongo,'BORRADOR');
        g_operacion := NULL;
    EXCEPTION
        WHEN OTHERS THEN g_operacion := NULL; RAISE;
    END;

    PROCEDURE AgregarItem(p_id_venta NUMBER, p_id_producto NUMBER, p_cantidad NUMBER) IS
        v_estado VARCHAR2(10);
        v_pago VARCHAR2(10);
        v_precio NUMBER;
        v_subtotal NUMBER;
    BEGIN
        SELECT estado_registro,estado_pago INTO v_estado,v_pago FROM Venta
        WHERE id_venta = p_id_venta FOR UPDATE;
        IF v_estado <> 'BORRADOR' OR v_pago = 'ANULADA' THEN
            RAISE_APPLICATION_ERROR(-20014, 'Solo se agregan productos a una venta en borrador');
        END IF;
        IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad <> TRUNC(p_cantidad) THEN
            RAISE_APPLICATION_ERROR(-20001, 'La cantidad debe ser un entero mayor que cero');
        END IF;
        -- El bloqueo conserva el mismo precio durante el descuento de stock del trigger.
        SELECT valor_unitario INTO v_precio FROM Productos
        WHERE id_producto = p_id_producto AND activo = 1 FOR UPDATE;
        v_subtotal := ROUND(v_precio * p_cantidad,2);
        g_operacion := 'ITEM';
        INSERT INTO Detalle_venta(id_detalle,id_venta,id_producto,cantidad,
            precio_unitario,subtotal,descuento,total_venta)
        VALUES(seq_detalle_venta.NEXTVAL,p_id_venta,p_id_producto,p_cantidad,
            v_precio,v_subtotal,0,v_subtotal);
        g_operacion := NULL;
    EXCEPTION
        WHEN OTHERS THEN g_operacion := NULL; RAISE;
    END;

    PROCEDURE FinalizarVenta(p_id_venta NUMBER) IS
        v_estado VARCHAR2(10);
        v_pago VARCHAR2(10);
        v_subtotal NUMBER;
        v_descuento NUMBER;
        v_cantidad NUMBER;
        v_linea NUMBER := 0;
        v_asignado NUMBER := 0;
        v_desc_linea NUMBER;
    BEGIN
        SAVEPOINT antes_finalizar;
        SELECT estado_registro,estado_pago INTO v_estado,v_pago FROM Venta
        WHERE id_venta = p_id_venta FOR UPDATE;
        IF v_estado <> 'BORRADOR' OR v_pago = 'ANULADA' THEN
            RAISE_APPLICATION_ERROR(-20014, 'La venta no esta en borrador');
        END IF;
        SELECT COUNT(*),NVL(SUM(subtotal),0) INTO v_cantidad,v_subtotal
        FROM Detalle_venta WHERE id_venta = p_id_venta;
        IF v_cantidad = 0 THEN RAISE_APPLICATION_ERROR(-20006, 'La venta no tiene productos'); END IF;
        v_descuento := CalcularDescuento(v_subtotal);
        g_operacion := 'FINALIZAR';
        -- Prorrateo: el ultimo detalle absorbe los centavos del redondeo.
        FOR r IN (SELECT id_detalle,subtotal FROM Detalle_venta
                  WHERE id_venta = p_id_venta ORDER BY id_detalle) LOOP
            v_linea := v_linea + 1;
            IF v_linea = v_cantidad THEN v_desc_linea := v_descuento-v_asignado;
            ELSE v_desc_linea := TRUNC(v_descuento*r.subtotal/v_subtotal,2); END IF;
            UPDATE Detalle_venta SET descuento = v_desc_linea,total_venta = subtotal-v_desc_linea
            WHERE id_detalle = r.id_detalle;
            v_asignado := v_asignado + v_desc_linea;
        END LOOP;
        UPDATE Venta SET subtotal = v_subtotal,descuento = v_descuento,
            total_venta = v_subtotal-v_descuento,estado_registro = 'CONFIRMADA'
        WHERE id_venta = p_id_venta;
        g_operacion := NULL;
    EXCEPTION
        WHEN OTHERS THEN g_operacion := NULL; ROLLBACK TO antes_finalizar; RAISE;
    END;

    PROCEDURE RegistrarVenta(p_id_empleado NUMBER, p_id_producto NUMBER,
        p_cantidad NUMBER, p_id_venta OUT NUMBER) IS
        v_tienda NUMBER;
        v_precio NUMBER;
    BEGIN
        -- Compatibilidad: el procedimiento legacy representa ahora una venta TARREO.
        SAVEPOINT inicio_venta;
        ValidarDatos(p_id_empleado,p_id_producto,p_cantidad,v_tienda,v_precio);
        CrearVenta(p_id_empleado,'TARREO',NULL,'EFECTIVO',NULL,p_id_venta);
        AgregarItem(p_id_venta,p_id_producto,p_cantidad);
        FinalizarVenta(p_id_venta);
    EXCEPTION
        WHEN OTHERS THEN g_operacion := NULL; ROLLBACK TO inicio_venta; RAISE;
    END;

    PROCEDURE AnularVenta(p_id_venta NUMBER) IS
        v_pago VARCHAR2(10);
        v_estado VARCHAR2(10);
    BEGIN
        SAVEPOINT antes_anular;
        SELECT estado_pago,estado_registro INTO v_pago,v_estado FROM Venta
        WHERE id_venta = p_id_venta FOR UPDATE;
        -- Idempotente: nunca devolver el stock dos veces.
        IF v_pago = 'ANULADA' THEN RETURN; END IF;
        IF v_estado <> 'CONFIRMADA' THEN
            RAISE_APPLICATION_ERROR(-20014, 'Para deshacer un borrador se debe hacer rollback');
        END IF;
        FOR r IN (SELECT id_producto,SUM(cantidad) cantidad FROM Detalle_venta
                  WHERE id_venta = p_id_venta GROUP BY id_producto ORDER BY id_producto) LOOP
            UPDATE Productos SET stock = stock+r.cantidad WHERE id_producto = r.id_producto;
        END LOOP;
        g_operacion := 'ANULAR';
        UPDATE Venta SET estado_pago = 'ANULADA' WHERE id_venta = p_id_venta;
        g_operacion := NULL;
    EXCEPTION
        WHEN OTHERS THEN g_operacion := NULL; ROLLBACK TO antes_anular; RAISE;
    END;

    PROCEDURE CobrarVenta(p_id_venta NUMBER, p_metodo_pago VARCHAR2) IS
        v_pago VARCHAR2(10);
        v_estado VARCHAR2(10);
        v_metodo VARCHAR2(15);
    BEGIN
        IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('EFECTIVO','TRANSFERENCIA') THEN
            RAISE_APPLICATION_ERROR(-20011, 'Debe indicar EFECTIVO o TRANSFERENCIA');
        END IF;
        SELECT estado_pago,estado_registro,metodo_pago INTO v_pago,v_estado,v_metodo
        FROM Venta WHERE id_venta = p_id_venta FOR UPDATE;
        IF v_pago = 'COBRADA' AND v_metodo = p_metodo_pago THEN RETURN; END IF;
        IF v_estado <> 'CONFIRMADA' OR v_pago <> 'PENDIENTE' THEN
            RAISE_APPLICATION_ERROR(-20015, 'Solo se puede cobrar una venta confirmada pendiente');
        END IF;
        g_operacion := 'COBRAR';
        UPDATE Venta SET estado_pago = 'COBRADA',metodo_pago = p_metodo_pago WHERE id_venta = p_id_venta;
        g_operacion := NULL;
    EXCEPTION
        WHEN OTHERS THEN g_operacion := NULL; RAISE;
    END;

    PROCEDURE AsignarRepartidor(p_id_venta NUMBER, p_id_empleado NUMBER) IS
        v_existe NUMBER;
        v_pago VARCHAR2(10);
        v_estado VARCHAR2(10);
    BEGIN
        SELECT estado_pago,estado_registro INTO v_pago,v_estado FROM Venta
        WHERE id_venta = p_id_venta FOR UPDATE;
        IF v_pago <> 'PENDIENTE' OR v_estado <> 'CONFIRMADA' THEN
            RAISE_APPLICATION_ERROR(-20015, 'Solo se asignan ventas confirmadas pendientes');
        END IF;
        SELECT COUNT(*) INTO v_existe FROM Usuario WHERE id_empleado = p_id_empleado
        AND rol = 'REPARTIDOR' AND activo = 1;
        IF v_existe = 0 THEN RAISE_APPLICATION_ERROR(-20012, 'Repartidor no disponible'); END IF;
        g_operacion := 'ASIGNAR';
        UPDATE Venta SET id_empleado = p_id_empleado WHERE id_venta = p_id_venta;
        g_operacion := NULL;
    EXCEPTION
        WHEN OTHERS THEN g_operacion := NULL; RAISE;
    END;
END PkgVentas;
/
-- No se puede insertar una cabecera confirmada ni editarla mediante DML directo.
CREATE OR REPLACE TRIGGER TrgVentaConfirmada
BEFORE INSERT OR UPDATE OR DELETE ON Venta
FOR EACH ROW
DECLARE
    v_operacion VARCHAR2(15) := PkgVentas.OperacionPermitida;
BEGIN
    IF INSERTING AND v_operacion = 'CREAR' AND :NEW.estado_registro = 'BORRADOR' THEN RETURN; END IF;
    IF UPDATING THEN
        IF v_operacion = 'FINALIZAR' AND :OLD.estado_registro = 'BORRADOR'
           AND :NEW.estado_registro = 'CONFIRMADA' THEN RETURN; END IF;
        -- La anulacion solo cambia estado_pago: ni importes ni detalles son editables.
        IF v_operacion = 'ANULAR' AND :OLD.estado_registro = 'CONFIRMADA'
           AND :OLD.estado_pago IN ('PENDIENTE','COBRADA') AND :NEW.estado_pago = 'ANULADA'
           AND NOT (UPDATING('SUBTOTAL') OR UPDATING('DESCUENTO') OR UPDATING('TOTAL_VENTA')
                    OR UPDATING('ID_EMPLEADO') OR UPDATING('ID_TIENDA') OR UPDATING('ID_CLIENTE')
                    OR UPDATING('CANAL') OR UPDATING('METODO_PAGO') OR UPDATING('FECHA_VENTA')
                    OR UPDATING('ID_PEDIDO_MONGO') OR UPDATING('ESTADO_REGISTRO') OR UPDATING('ID_VENTA'))
           THEN RETURN; END IF;
        IF v_operacion = 'COBRAR' AND :OLD.estado_pago = 'PENDIENTE'
           AND :NEW.estado_pago = 'COBRADA' AND :OLD.estado_registro = 'CONFIRMADA' THEN RETURN; END IF;
        IF v_operacion = 'ASIGNAR' AND :OLD.estado_pago = 'PENDIENTE'
           AND :OLD.estado_registro = 'CONFIRMADA' THEN RETURN; END IF;
    END IF;
    RAISE_APPLICATION_ERROR(-20004, 'Venta protegida: utilice los procedimientos de PkgVentas');
END;
/
CREATE OR REPLACE TRIGGER TrgDetalleConfirmado
BEFORE UPDATE OR DELETE ON Detalle_venta
FOR EACH ROW
BEGIN
    IF UPDATING AND PkgVentas.OperacionPermitida = 'FINALIZAR'
       AND NOT (UPDATING('ID_DETALLE') OR UPDATING('ID_VENTA') OR UPDATING('ID_PRODUCTO')
                OR UPDATING('CANTIDAD') OR UPDATING('PRECIO_UNITARIO') OR UPDATING('SUBTOTAL')) THEN RETURN; END IF;
    RAISE_APPLICATION_ERROR(-20004, 'No se puede cambiar ni eliminar un detalle confirmado');
END;
/
CREATE OR REPLACE TRIGGER TrgDetalleStock
BEFORE INSERT ON Detalle_venta
FOR EACH ROW
DECLARE
    v_stock NUMBER;
    v_activo NUMBER;
    v_estado VARCHAR2(10);
BEGIN
    IF NVL(PkgVentas.OperacionPermitida,'NINGUNA') <> 'ITEM' THEN
        RAISE_APPLICATION_ERROR(-20004, 'Los detalles se agregan mediante PkgVentas.AgregarItem');
    END IF;
    SELECT estado_registro INTO v_estado FROM Venta WHERE id_venta = :NEW.id_venta FOR UPDATE;
    IF v_estado <> 'BORRADOR' THEN RAISE_APPLICATION_ERROR(-20004, 'La venta ya esta confirmada'); END IF;
    SELECT stock,activo INTO v_stock,v_activo FROM Productos
    WHERE id_producto = :NEW.id_producto FOR UPDATE;
    IF v_activo = 0 THEN RAISE_APPLICATION_ERROR(-20005, 'Producto inactivo'); END IF;
    IF :NEW.cantidad IS NULL OR :NEW.cantidad <= 0 OR :NEW.cantidad <> TRUNC(:NEW.cantidad) THEN
        RAISE_APPLICATION_ERROR(-20001, 'Cantidad invalida');
    END IF;
    IF v_stock < :NEW.cantidad THEN
        RAISE_APPLICATION_ERROR(-20003, 'Stock insuficiente. Disponible: ' || v_stock);
    END IF;
    UPDATE Productos SET stock = stock-:NEW.cantidad WHERE id_producto = :NEW.id_producto;
END;
/
CREATE OR REPLACE PROCEDURE AnularVenta(p_id_venta NUMBER) IS
BEGIN
    PkgVentas.AnularVenta(p_id_venta);
END;
/
