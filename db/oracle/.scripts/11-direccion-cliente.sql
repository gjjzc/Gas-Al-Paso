PROMPT 11 - Direccion principal estructurada, sin interpretar ni borrar direcciones antiguas
DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns WHERE table_name='CLIENTE' AND column_name='CALLE_PRINCIPAL';
  IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE Cliente ADD calle_principal VARCHAR2(150)'; END IF;
  SELECT COUNT(*) INTO n FROM user_tab_columns WHERE table_name='CLIENTE' AND column_name='NUMERO_PRINCIPAL';
  IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE Cliente ADD numero_principal VARCHAR2(20)'; END IF;
  SELECT COUNT(*) INTO n FROM user_tab_columns WHERE table_name='CLIENTE' AND column_name='REFERENCIA_PRINCIPAL';
  IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE Cliente ADD referencia_principal VARCHAR2(200)'; END IF;
END;
/
COMMIT;
BEGIN
  DBMS_UTILITY.COMPILE_SCHEMA(schema=>USER,compile_all=>FALSE);
END;
/
DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_objects WHERE status='INVALID';
  IF n>0 THEN RAISE_APPLICATION_ERROR(-20024,'Existen objetos invalidos tras ampliar Cliente.'); END IF;
END;
/
