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
import { LayoutRepartidor } from './components/Repartidor.jsx';
import { PedidosAsignados } from './pages/repartidor/PedidosAsignados.jsx';
import { Tarreo } from './pages/repartidor/Tarreo.jsx';
import { VentasDia } from './pages/repartidor/VentasDia.jsx';
import { Cierre } from './pages/repartidor/Cierre.jsx';
import { Pedidos, Pedido } from './pages/Pedidos.jsx';
import { LayoutAdmin } from './components/Admin.jsx';
import { Tablero } from './pages/admin/Tablero.jsx';
import { PedidoAdmin } from './pages/admin/PedidoAdmin.jsx';
import { Llamada } from './pages/admin/Llamada.jsx';
import { Cargas } from './pages/admin/Cargas.jsx';
import { Productos } from './pages/admin/Productos.jsx';
import { Usuarios } from './pages/admin/Usuarios.jsx';
import { Cobertura } from './pages/admin/Cobertura.jsx';
import { Cuadratura } from './pages/admin/Cuadratura.jsx';
import { Clientes, ClienteDetalle } from './pages/admin/Clientes.jsx';
import { Auditoria } from './pages/admin/Auditoria.jsx';
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
  if (roles && !roles.includes(auth.usuario.rol))
    return <SinAcceso roles={roles} />;
  return <Outlet key={auth.usuario.id_usuario} />;
}
function SinAcceso({ roles }) {
  return (
    <Tarjeta className="vacio">
      <h1>
        {roles?.includes('ADMIN')
          ? 'Esta sección es para administradores'
          : roles?.includes('REPARTIDOR')
            ? 'Esta sección es para repartidores'
            : 'Esta sección es para clientes'}
      </h1>
      <p>Tu cuenta no tiene acceso a esta pantalla.</p>
      <EnlaceBoton to="/mi-espacio">Ir a mi espacio</EnlaceBoton>
    </Tarjeta>
  );
}
function Espacio() {
  const { usuario } = useAuth();
  if (usuario.rol === 'ADMIN') return <Navigate to="/admin/pedidos" replace />;
  if (usuario.rol === 'REPARTIDOR')
    return <Navigate to="/repartidor/pedidos" replace />;
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
        <p>Desde tu cuenta puedes consultar el catálogo y tus pedidos.</p>
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
        <Route element={<Protegida roles={['REPARTIDOR']} />}>
          <Route path="repartidor" element={<LayoutRepartidor />}>
            <Route index element={<Navigate to="pedidos" replace />} />
            <Route path="pedidos" element={<PedidosAsignados />} />
            <Route path="tarreo" element={<Tarreo />} />
            <Route path="ventas" element={<VentasDia />} />
            <Route path="cierre" element={<Cierre />} />
          </Route>
        </Route>
        <Route element={<Protegida roles={['ADMIN']} />}>
          <Route path="admin" element={<LayoutAdmin />}>
            <Route index element={<Navigate to="pedidos" replace />} />
            <Route path="pedidos" element={<Tablero />} />
            <Route path="pedidos/:id" element={<PedidoAdmin />} />
            <Route path="llamada" element={<Llamada />} />
            <Route path="cargas" element={<Cargas />} />
            <Route path="productos" element={<Productos />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/:id" element={<ClienteDetalle />} />
            <Route path="cobertura" element={<Cobertura />} />
            <Route path="cuadratura" element={<Cuadratura />} />
            <Route path="auditoria" element={<Auditoria />} />
          </Route>
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
