PROMPT 08 - Idempotencia del flujo de ventas (sin borrar datos)
DECLARE
    v_existe NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_existe FROM user_tables WHERE table_name='SOLICITUD_VENTA';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE Solicitud_Venta (
            id_usuario NUMBER NOT NULL REFERENCES Usuario(id_usuario),
            clave VARCHAR2(100) NOT NULL,
            huella VARCHAR2(64) NOT NULL,
            canal VARCHAR2(10) NOT NULL CHECK (canal IN (''WEB'',''LLAMADA'',''TARREO'')),
            id_venta NUMBER UNIQUE REFERENCES Venta(id_venta),
            creado_en TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT pk_solicitud_venta PRIMARY KEY(id_usuario,clave)
        )';
    END IF;
    SELECT COUNT(*) INTO v_existe FROM user_tab_columns WHERE table_name='SOLICITUD_VENTA' AND column_name='CARRITO_VERSION';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE Solicitud_Venta ADD (carrito_version VARCHAR2(100))';
    END IF;
    SELECT COUNT(*) INTO v_existe FROM user_constraints WHERE constraint_name='UQ_SOLICITUD_CARRITO';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE Solicitud_Venta ADD CONSTRAINT uq_solicitud_carrito UNIQUE(carrito_version)';
    END IF;
    SELECT COUNT(*) INTO v_existe FROM user_indexes WHERE index_name='IX_PENDIENTE_VENTA';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX ix_pendiente_venta ON Pendiente_Mongo(id_venta,tipo,id_evento)';
    END IF;
END;
/
COMMIT;
