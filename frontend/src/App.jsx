import { Component } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/Auth.jsx';
import { Layout } from './components/Layout.jsx';
import {
  Boton,
  Cargando,
  Encabezado,
  EnlaceBoton,
  ErrorAviso,
  Tarjeta,
} from './components/UI.jsx';
import { Catalogo } from './pages/Catalogo.jsx';
import { Login, Registro } from './pages/Acceso.jsx';
import { Carrito } from './pages/Carrito.jsx';
import { Confirmar } from './pages/Confirmar.jsx';
import { Pedidos, Pedido } from './pages/Pedidos.jsx';
function Protegida({ roles }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.cargando) return <Cargando texto="Verificando tu sesión…" />;
  if (!auth.usuario && auth.error && !auth.error.startsWith('Tu sesión'))
    return <ErrorAviso mensaje={auth.error} reintentar={auth.verificar} />;
  if (!auth.usuario)
    return (
      <Navigate to="/login" replace state={{ desde: location.pathname }} />
    );
  if (roles && !roles.includes(auth.usuario.rol)) return <SinAcceso />;
  return <Outlet key={auth.usuario.id_usuario} />;
}
function SinAcceso() {
  return (
    <Tarjeta className="vacio">
      <h1>Esta sección es para clientes</h1>
      <p>Tu cuenta no tiene acceso a esta pantalla.</p>
      <EnlaceBoton to="/mi-espacio">Ir a mi espacio</EnlaceBoton>
    </Tarjeta>
  );
}
function Espacio() {
  const { usuario } = useAuth();
  return (
    <>
      <Encabezado
        etiqueta="TU CUENTA"
        titulo={
          usuario.rol === 'ADMIN'
            ? 'Administración'
            : usuario.rol === 'REPARTIDOR'
              ? 'Espacio del repartidor'
              : 'Mi cuenta'
        }
      />
      <Tarjeta>
        <h2>Hola, {usuario.nombre}</h2>
        <p>Tu sesión está activa con el rol {usuario.rol}.</p>
        <p>
          Las pantallas de administración y reparto se incorporarán en las
          siguientes fases. Sus funciones actuales están disponibles en la API.
        </p>
        <EnlaceBoton to="/catalogo" variante="secundario">
          Ver catálogo
        </EnlaceBoton>
      </Tarjeta>
    </>
  );
}
export class LimiteErrores extends Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="contenedor">
        <ErrorAviso mensaje="No pudimos mostrar esta pantalla." />
        <Boton onClick={() => window.location.reload()}>Volver a cargar</Boton>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/catalogo" replace />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="login" element={<Login />} />
        <Route path="registro" element={<Registro />} />
        <Route element={<Protegida roles={['CLIENTE']} />}>
          <Route path="carrito" element={<Carrito />} />
          <Route path="confirmar" element={<Confirmar />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="pedidos/:id" element={<Pedido />} />
        </Route>
        <Route element={<Protegida />}>
          <Route path="mi-espacio" element={<Espacio />} />
        </Route>
        <Route
          path="*"
          element={
            <Tarjeta className="vacio">
              <h1>No encontramos esta página</h1>
              <EnlaceBoton to="/catalogo">Volver al catálogo</EnlaceBoton>
            </Tarjeta>
          }
        />
      </Route>
    </Routes>
  );
}
