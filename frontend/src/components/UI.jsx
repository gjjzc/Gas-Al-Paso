import { useId } from 'react';
import { Link } from 'react-router-dom';
import { clp } from '../services/api.js';
export function Boton({
  variante = 'principal',
  children,
  className = '',
  ...props
}) {
  return (
    <button className={`boton boton-${variante} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function EnlaceBoton({
  variante = 'principal',
  className = '',
  ...props
}) {
  return <Link className={`boton boton-${variante} ${className}`} {...props} />;
}
export function Tarjeta({
  as: Etiqueta = 'section',
  className = '',
  children,
  ...props
}) {
  return (
    <Etiqueta className={`tarjeta ${className}`} {...props}>
      {children}
    </Etiqueta>
  );
}
export function Campo({ label, ayuda, children, ...props }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{label}</label>
      {children ? (
        <select
          id={id}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          {...props}
        >
          {children}
        </select>
      ) : (
        <input
          id={id}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          {...props}
        />
      )}
      {ayuda && <small id={`${id}-ayuda`}>{ayuda}</small>}
    </div>
  );
}
export function Formulario({ children, ...props }) {
  return (
    <form className="formulario" {...props}>
      {children}
    </form>
  );
}
export function ErrorAviso({ mensaje, reintentar }) {
  if (!mensaje) return null;
  return (
    <div className="aviso aviso-error" role="alert">
      <span>{mensaje}</span>
      {reintentar && (
        <Boton variante="secundario" onClick={reintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  );
}
export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="cargando" role="status">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </div>
  );
}
export const estados = {
  RECIBIDO: 'Recibido',
  ASIGNADO: 'Asignado',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};
export function Insignia({ estado }) {
  return (
    <span className={`insignia estado-${estado}`}>
      {estados[estado] || estado}
    </span>
  );
}
export function Tabla({ columnas, children, titulo }) {
  return (
    <div className="tabla-scroll">
      <table>
        <caption>{titulo}</caption>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Vacio({
  titulo,
  children,
  enlace = '/catalogo',
  accion = 'Ver catálogo',
}) {
  return (
    <Tarjeta className="vacio">
      <span className="vacio-icono" aria-hidden="true">
        ○
      </span>
      <h2>{titulo}</h2>
      <p>{children}</p>
      <EnlaceBoton to={enlace}>{accion}</EnlaceBoton>
    </Tarjeta>
  );
}
export function Totales({ datos }) {
  return (
    <dl className="totales">
      <div>
        <dt>Subtotal</dt>
        <dd>{clp(datos.subtotal)}</dd>
      </div>
      <div className={datos.descuento ? 'descuento' : ''}>
        <dt>Descuento {datos.descuento > 0 && '(10%)'}</dt>
        <dd>−{clp(datos.descuento)}</dd>
      </div>
      <div className="total">
        <dt>Total</dt>
        <dd>{clp(datos.total)}</dd>
      </div>
    </dl>
  );
}
export function Encabezado({ etiqueta, titulo, children, accion }) {
  return (
    <header className="encabezado">
      <div>
        {etiqueta && <p className="ceja">{etiqueta}</p>}
        <h1>{titulo}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
      {accion}
    </header>
  );
}
