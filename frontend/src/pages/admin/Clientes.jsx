import { useNavigate, useParams } from 'react-router-dom';
import { BuscadorClientes } from '../../components/BuscadorClientes.jsx';
import { FichaCliente } from '../../components/FichaCliente.jsx';
import { Encabezado, EnlaceBoton, Tarjeta } from '../../components/UI.jsx';
export function Clientes() {
  const navegar = useNavigate();
  return (
    <>
      <Encabezado etiqueta="CONTACTOS Y PEDIDOS" titulo="Clientes por teléfono">
        Busca clientes con o sin cuenta y consulta su historial.
      </Encabezado>
      <Tarjeta>
        <BuscadorClientes
          onElegir={(id) => navegar(`/admin/clientes/${id}`)}
          onCrear={(telefono) =>
            navegar('/admin/llamada', { state: { telefono } })
          }
        />
      </Tarjeta>
    </>
  );
}
export function ClienteDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  return (
    <>
      <Encabezado
        etiqueta="CONTACTOS Y PEDIDOS"
        titulo="Ficha del cliente"
        accion={
          <EnlaceBoton variante="secundario" to="/admin/clientes">
            Volver a buscar
          </EnlaceBoton>
        }
      />
      <FichaCliente
        key={id}
        id={id}
        onNuevo={(c) => navegar(`/admin/llamada?cliente=${c.id_cliente}`)}
      />
    </>
  );
}
