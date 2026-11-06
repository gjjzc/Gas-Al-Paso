PROMPT 07 - Migracion idempotente para API base (sin borrar datos)
-- Secuencias para tablas legacy que recibiran altas desde la API.
DECLARE
    v_existe NUMBER;
    v_inicio NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_existe FROM user_sequences WHERE sequence_name='SEQ_PRODUCTO';
    IF v_existe=0 THEN
        SELECT NVL(MAX(id_producto),0)+1 INTO v_inicio FROM Productos;
        EXECUTE IMMEDIATE 'CREATE SEQUENCE seq_producto START WITH '||TO_CHAR(v_inicio,'FM999999999999999999')||' INCREMENT BY 1 NOCACHE';
    END IF;
    SELECT COUNT(*) INTO v_existe FROM user_sequences WHERE sequence_name='SEQ_EMPLEADO';
    IF v_existe=0 THEN
        SELECT NVL(MAX(id_empleado),0)+1 INTO v_inicio FROM Empleado;
        EXECUTE IMMEDIATE 'CREATE SEQUENCE seq_empleado START WITH '||TO_CHAR(v_inicio,'FM999999999999999999')||' INCREMENT BY 1 NOCACHE';
    END IF;
    SELECT COUNT(*) INTO v_existe FROM user_tab_columns WHERE table_name='USUARIO' AND column_name='TOKEN_VERSION';
    IF v_existe=0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE Usuario ADD (token_version NUMBER DEFAULT 0 NOT NULL CHECK (token_version >= 0))';
    END IF;
END;
/
BEGIN
    DBMS_UTILITY.COMPILE_SCHEMA(schema=>USER,compile_all=>FALSE);
END;
/
COMMIT;
