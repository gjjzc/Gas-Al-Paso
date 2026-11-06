import { useEffect, useId, useRef } from 'react';
import { Boton } from './UI.jsx';
export function Confirmacion({
  titulo,
  children,
  aceptar,
  cancelar,
  texto = 'Confirmar',
  ocupado = false,
  inhabilitado = false,
}) {
  const dialogo = useRef(null);
  const id = useId();
  useEffect(() => {
    const elemento = dialogo.current;
    elemento.showModal();
    return () => {
      elemento.close();
    };
  }, []);
  return (
    <dialog
      className="dialogo"
      ref={dialogo}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!ocupado) cancelar();
      }}
    >
      <h2 id={id}>{titulo}</h2>
      <div className="dialogo-contenido">{children}</div>
      <div className="dialogo-acciones">
        <Boton
          type="button"
          variante="secundario"
          disabled={ocupado}
          onClick={cancelar}
        >
          Volver
        </Boton>
        <Boton
          type="button"
          disabled={ocupado || inhabilitado}
          onClick={aceptar}
        >
          {ocupado ? 'Guardando…' : texto}
        </Boton>
      </div>
    </dialog>
  );
}
