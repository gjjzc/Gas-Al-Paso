import { NavLink, Outlet } from 'react-router-dom';
import { clp } from '../services/api.js';
import { Boton, Tarjeta } from './UI.jsx';
export const pago = (metodo) =>
  metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo';
export function LayoutRepartidor() {
  return (
    <div className="zona-repartidor">
      <nav className="nav-jornada" aria-label="Jornada del repartidor">
        <NavLink to="/repartidor/pedidos">Pedidos</NavLink>
        <NavLink to="/repartidor/tarreo">Venta calle</NavLink>
        <NavLink to="/repartidor/ventas">Ventas del día</NavLink>
        <NavLink to="/repartidor/cierre">Cierre</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
export function OperacionPendiente({ operacion, reintentar }) {
  if (!operacion.pendiente) return null;
  return (
    <Tarjeta className="operacion-pendiente">
      <h2>Solicitud pendiente de respuesta</h2>
      <p>
        Podría haberse guardado. Comprueba el resultado reintentando la misma
        solicitud; no se duplicará.
      </p>
      {operacion.pendiente.vista?.titulo && (
        <p>
          <strong>{operacion.pendiente.vista.titulo}</strong>
        </p>
      )}
      {operacion.pendiente.vista?.total !== undefined && (
        <p>Total enviado: {clp(operacion.pendiente.vista.total)}</p>
      )}
      {operacion.pendiente.body.metodo_pago && (
        <p>Pago: {pago(operacion.pendiente.body.metodo_pago)}</p>
      )}
      <Boton disabled={operacion.enviando} onClick={reintentar}>
        {operacion.enviando ? 'Comprobando…' : 'Reintentar misma solicitud'}
      </Boton>
    </Tarjeta>
  );
}
export function ResumenJornada({ datos }) {
  return (
    <div className="indicadores-jornada">
      <Tarjeta>
        <small>Total cobrado</small>
        <strong>{clp(datos.total_cobrado)}</strong>
        <span>{datos.cobradas} ventas cobradas</span>
      </Tarjeta>
      <Tarjeta>
        <small>Efectivo</small>
        <strong>{clp(datos.efectivo)}</strong>
        <span>Cobrado en el día</span>
      </Tarjeta>
      <Tarjeta>
        <small>Transferencia</small>
        <strong>{clp(datos.transferencia)}</strong>
        <span>Cobrado en el día</span>
      </Tarjeta>
    </div>
  );
}
