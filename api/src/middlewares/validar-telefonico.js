import { campos, entero, booleano, texto } from './validar.js';
import {
  nombreCliente,
  normalizarTelefono,
  errorCampo,
} from './validar-cliente.js';
import { lineas, metodoPago } from './validar-ventas.js';
function campoTexto(valor, campo, max, min = 1) {
  try {
    return texto(valor, campo, max, min);
  } catch {
    errorCampo(campo, `${campo}: ingresa entre ${min} y ${max} caracteres.`);
  }
}
export function direccionTelefonica(d) {
  campos(
    d,
    ['calle', 'numero', 'comuna', 'id_comuna', 'referencia'],
    ['calle', 'numero'],
  );
  if ((d.comuna === undefined) === (d.id_comuna === undefined))
    errorCampo('comuna', 'Indica una sola comuna.');
  const valor = d.comuna ?? d.id_comuna;
  let comuna;
  if (
    typeof valor === 'number' ||
    (typeof valor === 'string' && /^\d+$/.test(valor))
  ) {
    try {
      comuna = { id_comuna: entero(Number(valor), 'comuna') };
    } catch {
      errorCampo('comuna', 'Selecciona una comuna válida.');
    }
  } else comuna = { nombre_comuna: campoTexto(valor, 'comuna', 80) };
  return {
    calle: campoTexto(d.calle, 'calle', 150),
    numero: campoTexto(d.numero, 'numero', 20),
    ...comuna,
    referencia:
      d.referencia === undefined
        ? ''
        : campoTexto(d.referencia, 'referencia', 200, 0),
  };
}
export function validarTelefonico(b) {
  campos(
    b,
    [
      'id_cliente',
      'cliente',
      'nombre',
      'telefono',
      'direccion',
      'direccion_entrega',
      'items',
      'metodo_cobro',
      'guardar_como_principal',
    ],
    ['items', 'metodo_cobro'],
  );
  let datos;
  if (b.id_cliente !== undefined) {
    if (
      ['cliente', 'nombre', 'telefono', 'direccion'].some(
        (k) => b[k] !== undefined,
      )
    )
      errorCampo(
        'cliente',
        'Usa id_cliente o los datos de un cliente, no ambos.',
      );
    datos = {
      id_cliente: entero(b.id_cliente, 'id_cliente'),
      direccion_entrega: direccionTelefonica(b.direccion_entrega),
    };
  } else {
    if (b.direccion_entrega !== undefined)
      errorCampo(
        'direccion',
        'Para un cliente por teléfono incluye su dirección en cliente.direccion.',
      );
    if (
      b.cliente !== undefined &&
      ['nombre', 'telefono', 'direccion'].some((k) => b[k] !== undefined)
    )
      errorCampo(
        'cliente',
        'No mezcles cliente con campos de cliente al nivel principal.',
      );
    const c = b.cliente ?? {
      nombre: b.nombre,
      telefono: b.telefono,
      direccion: b.direccion,
    };
    campos(
      c,
      ['nombre', 'telefono', 'direccion'],
      ['nombre', 'telefono', 'direccion'],
    );
    datos = {
      cliente_nuevo: {
        nombre: nombreCliente(c.nombre),
        telefono: normalizarTelefono(c.telefono),
      },
      direccion_entrega: direccionTelefonica(c.direccion),
    };
  }
  if (
    b.guardar_como_principal !== undefined &&
    booleano(b.guardar_como_principal, 'guardar_como_principal')
  )
    datos.guardar_como_principal = true;
  let items, metodo;
  try {
    items = lineas(b.items);
  } catch (e) {
    errorCampo('items', e.message);
  }
  try {
    metodo = metodoPago(b.metodo_cobro);
  } catch (e) {
    errorCampo('metodo_cobro', e.message);
  }
  return { ...datos, metodo_cobro: metodo, items };
}
