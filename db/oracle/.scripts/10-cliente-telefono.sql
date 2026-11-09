PROMPT 10 - Telefono normalizado y unico; clientes sin cuenta
-- Ejecutar con API detenida. No borra ni fusiona clientes, usuarios o ventas.
DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns WHERE table_name='CLIENTE' AND column_name='TELEFONO_REVISION';
  IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE Cliente ADD telefono_revision NUMBER(1) DEFAULT 0 NOT NULL CHECK(telefono_revision IN (0,1))'; END IF;
  SELECT COUNT(*) INTO n FROM user_tables WHERE table_name='CLIENTE_TELEFONO_REVISION';
  IF n=0 THEN EXECUTE IMMEDIATE 'CREATE TABLE Cliente_telefono_revision(
    id_cliente NUMBER PRIMARY KEY REFERENCES Cliente(id_cliente),telefono_original VARCHAR2(20),
    telefono_normalizado VARCHAR2(20),telefono_provisional VARCHAR2(9) NOT NULL,
    motivo VARCHAR2(40) NOT NULL,creado_en TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)'; END IF;
END;
/
DECLARE
  TYPE conjunto IS TABLE OF BOOLEAN INDEX BY VARCHAR2(30);
  ocupados conjunto; usados conjunto;
  normal VARCHAR2(30); provisional VARCHAR2(9); v_motivo VARCHAR2(40);
  candidato NUMBER:=99999999;
  FUNCTION normalizar(t VARCHAR2) RETURN VARCHAR2 IS d VARCHAR2(100);
  BEGIN
    IF NOT REGEXP_LIKE(t,'^[+0-9[:space:]().-]+$') THEN RETURN NULL; END IF;
    d:=REGEXP_REPLACE(t,'[^0-9]','');
    IF LENGTH(d)=13 AND SUBSTR(d,1,4)='0056' THEN d:=SUBSTR(d,5);
    ELSIF LENGTH(d)=11 AND SUBSTR(d,1,2)='56' THEN d:=SUBSTR(d,3); END IF;
    IF REGEXP_LIKE(d,'^9[0-9]{8}$') THEN RETURN d; END IF;
    RETURN NULL;
  END;
BEGIN
  LOCK TABLE Cliente IN EXCLUSIVE MODE;
  -- Reservar todos los numeros reales antes de asignar provisionales.
  FOR c IN (SELECT telefono FROM Cliente) LOOP
    normal:=normalizar(c.telefono);
    IF normal IS NOT NULL THEN ocupados(normal):=TRUE; END IF;
  END LOOP;
  FOR c IN (SELECT c.* FROM Cliente c ORDER BY
    CASE WHEN EXISTS(SELECT 1 FROM Usuario u WHERE u.id_cliente=c.id_cliente) THEN 0 ELSE 1 END,c.id_cliente) LOOP
    normal:=normalizar(c.telefono);
    IF c.telefono_revision=1 THEN
      usados(c.telefono):=TRUE; -- Ya tratado: repetir la migracion no lo renumera.
    ELSIF normal IS NOT NULL AND NOT usados.EXISTS(normal) THEN
      UPDATE Cliente SET telefono=normal WHERE id_cliente=c.id_cliente;
      usados(normal):=TRUE;
    ELSE
      v_motivo:=CASE WHEN normal IS NULL THEN 'FORMATO_INVALIDO' ELSE 'DUPLICADO_NORMALIZADO' END;
      LOOP
        IF candidato<0 THEN RAISE_APPLICATION_ERROR(-20022,'No hay numeros provisionales disponibles.'); END IF;
        provisional:='9'||LPAD(candidato,8,'0'); candidato:=candidato-1;
        EXIT WHEN NOT ocupados.EXISTS(provisional);
      END LOOP;
      ocupados(provisional):=TRUE; usados(provisional):=TRUE;
      MERGE INTO Cliente_telefono_revision r USING(SELECT c.id_cliente id FROM DUAL) d ON(r.id_cliente=d.id)
      WHEN NOT MATCHED THEN INSERT(id_cliente,telefono_original,telefono_normalizado,telefono_provisional,motivo)
        VALUES(c.id_cliente,c.telefono,normal,provisional,v_motivo);
      UPDATE Cliente SET telefono=provisional,telefono_revision=1 WHERE id_cliente=c.id_cliente;
    END IF;
  END LOOP;
  COMMIT;
END;
/
DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns WHERE table_name='CLIENTE' AND column_name='TELEFONO' AND nullable='Y';
  IF n>0 THEN EXECUTE IMMEDIATE 'ALTER TABLE Cliente MODIFY telefono NOT NULL'; END IF;
  SELECT COUNT(*) INTO n FROM user_indexes WHERE index_name='UQ_CLIENTE_TELEFONO';
  IF n=0 THEN EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX uq_cliente_telefono ON Cliente(telefono)'; END IF;
  SELECT COUNT(*) INTO n FROM user_constraints WHERE constraint_name='CK_CLIENTE_TELEFONO';
  IF n=0 THEN EXECUTE IMMEDIATE 'ALTER TABLE Cliente ADD CONSTRAINT ck_cliente_telefono CHECK(REGEXP_LIKE(telefono,''^9[0-9]{8}$''))'; END IF;
END;
/
CREATE OR REPLACE TRIGGER TrgTelefonoCliente
BEFORE INSERT OR UPDATE OF telefono ON Cliente FOR EACH ROW
DECLARE d VARCHAR2(100);
BEGIN
  IF NOT REGEXP_LIKE(:NEW.telefono,'^[+0-9[:space:]().-]+$') THEN
    RAISE_APPLICATION_ERROR(-20021,'Telefono invalido: usa 9 digitos empezando por 9.');
  END IF;
  d:=REGEXP_REPLACE(:NEW.telefono,'[^0-9]','');
  IF LENGTH(d)=13 AND SUBSTR(d,1,4)='0056' THEN d:=SUBSTR(d,5);
  ELSIF LENGTH(d)=11 AND SUBSTR(d,1,2)='56' THEN d:=SUBSTR(d,3); END IF;
  IF NOT REGEXP_LIKE(d,'^9[0-9]{8}$') THEN
    RAISE_APPLICATION_ERROR(-20021,'Telefono invalido: usa 9 digitos empezando por 9.');
  END IF;
  :NEW.telefono:=d;
  IF INSERTING OR d<>:OLD.telefono THEN :NEW.telefono_revision:=0; END IF;
END;
/
DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_errors WHERE name='TRGTELEFONOCLIENTE';
  IF n>0 THEN RAISE_APPLICATION_ERROR(-20023,'Error al compilar TrgTelefonoCliente.'); END IF;
  SELECT COUNT(*) INTO n FROM Cliente WHERE telefono_revision=1;
  DBMS_OUTPUT.PUT_LINE('Clientes que requieren revision de contacto: '||n);
END;
/
COMMIT;
