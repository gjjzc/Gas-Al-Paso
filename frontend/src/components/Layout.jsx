import { useEffect } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../context/Auth.jsx';
import { useCarrito } from '../context/Carrito.jsx';
import { Boton } from './UI.jsx';
import { Llama } from './Ilustraciones.jsx';
export function Layout() {
  const { usuario, salir } = useAuth();
  const { cantidad } = useCarrito();
  const location = useLocation();
  const navegar = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('contenido')?.focus({ preventScroll: true });
  }, [location.pathname]);
  const rol = {
    CLIENTE: 'Cliente',
    ADMIN: 'Administración',
    REPARTIDOR: 'Repartidor',
  };
  return (
    <>
      <a href="#contenido" className="saltar">
        Saltar al contenido
      </a>
      <div className="barra-superior">
        Tu gas, más cerca.{' '}
        <span>Pago contra entrega · Efectivo o transferencia</span>
      </div>
      <header className="cabecera">
        <div className="nav-contenedor">
          <Link className="marca" to="/catalogo">
            <span className="marca-icono">
              <Llama />
            </span>
            <span>
              Gas al Paso<small>ENERGÍA PARA TU DÍA</small>
            </span>
          </Link>
          <nav aria-label="Navegación principal">
            <NavLink to="/catalogo">Catálogo</NavLink>
            {usuario?.rol === 'CLIENTE' && (
              <>
                <NavLink to="/pedidos">Mis pedidos</NavLink>
                <NavLink to="/carrito">
                  Carrito <span className="contador">{cantidad}</span>
                </NavLink>
              </>
            )}
            {usuario && usuario.rol !== 'CLIENTE' && (
              <NavLink to="/mi-espacio">{rol[usuario.rol]}</NavLink>
            )}
            {!usuario ? (
              <Link className="boton boton-secundario" to="/login">
                Iniciar sesión
              </Link>
            ) : (
              <Boton
                variante="texto"
                onClick={() => {
                  salir();
                  navegar('/catalogo');
                }}
              >
                Salir
              </Boton>
            )}
          </nav>
        </div>
        {usuario && (
          <div className="sesion-linea">
            Hola, {usuario.nombre} <span>· {rol[usuario.rol]}</span>
          </div>
        )}
      </header>
      <main id="contenido" className="contenedor" tabIndex="-1">
        <Outlet />
      </main>
      <footer className="pie">
        <span className="marca-pie">
          Gas al Paso<span className="punto">.</span>
        </span>
        <span>Gas para tu hogar. A un paso de ti.</span>
        <small>Proyecto académico · Venta y reparto de gas</small>
      </footer>
    </>
  );
}
