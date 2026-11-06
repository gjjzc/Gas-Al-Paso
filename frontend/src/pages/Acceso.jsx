import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Auth.jsx';
import { useConsulta } from '../hooks/useConsulta.js';
import { api } from '../services/api.js';
import {
  Boton,
  Campo,
  Cargando,
  ErrorAviso,
  Formulario,
  Tarjeta,
} from '../components/UI.jsx';
import { Balon } from '../components/Ilustraciones.jsx';

export function Login() {
  const { login, error: errorSesion } = useAuth();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();
  const location = useLocation();
  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError('');
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const usuario = await login(datos);
      const destino = location.state?.desde;
      const permitido =
        typeof destino === 'string' &&
        /^\/(carrito|confirmar|pedidos)(\/|$)/.test(destino);
      navegar(
        usuario.rol === 'CLIENTE'
          ? permitido
            ? destino
            : '/catalogo'
          : usuario.rol === 'REPARTIDOR'
            ? typeof destino === 'string' && /^\/repartidor(\/|$)/.test(destino)
              ? destino
              : '/repartidor/pedidos'
            : '/mi-espacio',
        { replace: true },
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <div className="acceso">
      <section className="acceso-presentacion">
        <p className="ceja">BIENVENIDO A GAS AL PASO</p>
        <h1>
          La energía de tu hogar,
          <br />
          <span>a un paso.</span>
        </h1>
        <p>Pide tu gas, sigue tu pedido y paga cuando llegue a tu puerta.</p>
        <Balon peso={15} />
        <span className="nota">Simple. Cercano. A tu ritmo.</span>
      </section>
      <Tarjeta className="acceso-form">
        <p className="ceja">TU CUENTA</p>
        <h2>Qué bueno verte</h2>
        <p className="muted">Ingresa para continuar con tu pedido.</p>
        {location.state?.registrado && (
          <p className="aviso aviso-exito" role="status">
            Tu cuenta está lista. Ya puedes iniciar sesión.
          </p>
        )}
        <ErrorAviso mensaje={error || errorSesion} />
        <Formulario onSubmit={enviar}>
          <Campo
            label="Correo electrónico"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={150}
            required
          />
          <Campo
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Iniciar sesión'}
          </Boton>
        </Formulario>
        <p className="alternativa">
          ¿Primera vez aquí? <Link to="/registro">Crear una cuenta</Link>
        </p>
      </Tarjeta>
    </div>
  );
}
export function Registro() {
  const comunas = useConsulta('/comunas', { publico: true });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();
  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    if (datos.password !== datos.confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    delete datos.confirmacion;
    datos.id_comuna = Number(datos.id_comuna);
    setEnviando(true);
    setError('');
    try {
      await api('/auth/registro', {
        method: 'POST',
        body: datos,
        publico: true,
      });
      navegar('/login', { replace: true, state: { registrado: true } });
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Tarjeta className="registro">
      <p className="ceja">UN PASO PARA EMPEZAR</p>
      <h1>Crea tu cuenta</h1>
      <p className="muted">Guarda tus datos y recibe gas en tu hogar.</p>
      <ErrorAviso mensaje={error} />
      <ErrorAviso mensaje={comunas.error} reintentar={comunas.refrescar} />
      {comunas.cargando && <Cargando texto="Cargando comunas…" />}
      <Formulario onSubmit={enviar}>
        <div className="form-grid">
          <Campo
            label="Nombre completo"
            name="nombre"
            autoComplete="name"
            maxLength={80}
            required
          />
          <Campo
            label="Teléfono"
            name="telefono"
            type="tel"
            autoComplete="tel"
            maxLength={20}
            required
          />
          <Campo
            label="Correo electrónico"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={150}
            required
          />
          <Campo
            label="Comuna"
            name="id_comuna"
            defaultValue=""
            required
            disabled={!comunas.datos?.length}
          >
            <option value="" disabled>
              Selecciona tu comuna
            </option>
            {comunas.datos?.map((c) => (
              <option key={c.id_comuna} value={c.id_comuna}>
                {c.nombre}
              </option>
            ))}
          </Campo>
        </div>
        <Campo
          label="Dirección principal"
          name="direccion_principal"
          autoComplete="street-address"
          maxLength={200}
          required
          ayuda="La dirección de entrega se confirma antes de cada pedido."
        />
        <div className="form-grid">
          <Campo
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            ayuda="Mínimo 8 caracteres; máximo 72 bytes (algunos símbolos ocupan más de uno)."
          />
          <Campo
            label="Repetir contraseña"
            name="confirmacion"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </div>
        <Boton type="submit" disabled={enviando || !comunas.datos?.length}>
          {enviando ? 'Creando cuenta…' : 'Crear mi cuenta'}
        </Boton>
      </Formulario>
      <p className="alternativa">
        ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
      </p>
    </Tarjeta>
  );
}
