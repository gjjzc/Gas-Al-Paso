import { ImagenProducto } from '../components/ImagenProducto.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Auth.jsx';
import { useCarrito } from '../context/Carrito.jsx';
import { useConsulta } from '../hooks/useConsulta.js';
import { Balon } from '../components/Ilustraciones.jsx';
import { Boton, Cargando, ErrorAviso, Tarjeta } from '../components/UI.jsx';
import { clp } from '../services/api.js';
const TAMANO = 12;
export function Catalogo() {
  const [pagina, setPagina] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const consulta = useConsulta(
    `/catalogo?limite=${TAMANO}&offset=${pagina * TAMANO}${categoria ? `&categoria=${categoria}` : ''}`,
    { publico: true },
  );
  const { usuario } = useAuth();
  const carrito = useCarrito();
  const navegar = useNavigate();
  async function agregar(p) {
    if (!usuario) {
      navegar('/login', { state: { desde: '/carrito' } });
      return;
    }
    setError('');
    setAviso('');
    try {
      await carrito.modificar('/carrito/items', 'POST', {
        id_producto: p.id_producto,
        cantidad: 1,
      });
      setAviso(`${p.nombre} se agregó a tu carrito.`);
    } catch (e) {
      setError(e.message);
    }
  }
  const productos =
    consulta.datos?.filter((p) =>
      `${p.nombre} ${p.descripcion}`
        .toLocaleLowerCase('es')
        .includes(busqueda.toLocaleLowerCase('es')),
    ) || [];
  return (
    <>
      <section className="hero">
        <div className="hero-texto">
          <span className="hero-etiqueta">
            <span /> ENERGÍA PARA LO QUE IMPORTA
          </span>
          <h1>
            Que nada apague
            <br />
            los buenos momentos<span>.</span>
          </h1>
          <p>
            El gas de tu hogar, sin complicaciones.
            <br />
            Elige, pide y recibe en tu puerta.
          </p>
          <a className="boton boton-acento" href="#productos">
            Encuentra tu gas{' '}
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 16 16 4M5 4h11v11"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </a>
          <div className="hero-confianza">
            <span>✓ Pago contra entrega</span>
            <span>✓ Seguimiento del pedido</span>
          </div>
        </div>
        <div className="hero-arte">
          <div className="orbita" />
          <Balon peso={15} />
          <div className="hero-sello">
            <strong>Calor de hogar</strong>
            <span>A un paso de ti</span>
          </div>
          <span className="hero-peso">5 · 11 · 15 · 45 kg</span>
        </div>
      </section>
      <div className="beneficios">
        <span>
          <strong>01</strong> Elige tu producto
        </span>
        <span>
          <strong>02</strong> Confirma tu dirección
        </span>
        <span>
          <strong>03</strong> Recibe y paga
        </span>
        <span className="beneficio-descuento">
          10% de descuento desde $30.000
        </span>
      </div>
      <section id="productos" className="catalogo-seccion">
        <div className="encabezado">
          <div>
            <p className="ceja">NUESTROS PRODUCTOS</p>
            <h2>Gas listo para tu hogar</h2>
            <p className="muted">
              Balones y accesorios. Precios en pesos chilenos.
            </p>
          </div>
          <label className="buscador">
            <span>Buscar en esta página</span>
            <input
              type="search"
              placeholder="Nombre de producto…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>
        </div>
        <div className="filtros" aria-label="Filtrar productos">
          {[
            ['', 'Todos'],
            ['GAS', 'Balones de gas'],
            ['ACCESORIO', 'Accesorios'],
          ].map(([valor, nombre]) => (
            <Boton
              key={valor}
              variante={categoria === valor ? 'principal' : 'secundario'}
              aria-pressed={categoria === valor}
              onClick={() => {
                setCategoria(valor);
                setPagina(0);
              }}
            >
              {nombre}
            </Boton>
          ))}
        </div>
        <ErrorAviso mensaje={consulta.error} reintentar={consulta.refrescar} />
        <ErrorAviso mensaje={error} />
        {aviso && (
          <div className="aviso aviso-exito" role="status">
            {aviso} <Link to="/carrito">Ver carrito →</Link>
          </div>
        )}
        {consulta.cargando ? (
          <Cargando texto="Buscando productos para ti…" />
        ) : (
          <>
            <div className="productos-grid">
              {productos.map((p) => (
                <Tarjeta as="article" className="producto" key={p.id_producto}>
                  <div className="producto-imagen">
                    {p.destacado && (
                      <span className="etiqueta-destacado">
                        Favorito del hogar
                      </span>
                    )}
                    <ImagenProducto producto={p} />
                    <span className={`stock ${p.stock > 0 ? '' : 'sin-stock'}`}>
                      {p.stock > 0 ? '● Disponible' : 'Sin stock'}
                    </span>
                  </div>
                  <div className="producto-info">
                    <p className="ceja">
                      {p.categoria === 'GAS'
                        ? 'GAS PARA TU HOGAR'
                        : 'ACCESORIOS'}
                    </p>
                    <h3>{p.nombre}</h3>
                    <p className="producto-descripcion">{p.descripcion}</p>
                    <div className="producto-precio">
                      <strong>{clp(p.precio)}</strong>
                      <small>por unidad</small>
                    </div>
                    {!usuario || usuario.rol === 'CLIENTE' ? (
                      <Boton
                        variante="secundario"
                        disabled={p.stock <= 0 || carrito.ocupado}
                        onClick={() => agregar(p)}
                      >
                        {p.stock <= 0
                          ? 'Sin stock'
                          : carrito.ocupado
                            ? 'Actualizando…'
                            : 'Agregar al carrito'}{' '}
                        <span aria-hidden="true">＋</span>
                      </Boton>
                    ) : (
                      <p className="muted">
                        Disponible para compra con cuenta cliente.
                      </p>
                    )}
                  </div>
                </Tarjeta>
              ))}
            </div>
            {!productos.length && !consulta.error && (
              <p className="vacio">
                No encontramos productos con estos filtros.
              </p>
            )}
            <div className="paginacion">
              <Boton
                variante="secundario"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Boton>
              <span>Página {pagina + 1}</span>
              <Boton
                variante="secundario"
                disabled={!consulta.datos || consulta.datos.length < TAMANO}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </>
        )}
      </section>
      <section className="franja">
        <div>
          <p className="ceja">UN BENEFICIO QUE SE SIENTE</p>
          <h2>Más para tu hogar, menos en tu total.</h2>
          <p>
            Recibe un 10% de descuento en compras desde $30.000. Se aplica
            automáticamente al confirmar.
          </p>
        </div>
        <strong>
          10<span>%</span>
          <small>DE DESCUENTO</small>
        </strong>
      </section>
    </>
  );
}
