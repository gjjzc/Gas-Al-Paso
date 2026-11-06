const TOKEN = 'gas-al-paso.token';
export const sesion = {
  leer: () => sessionStorage.getItem(TOKEN),
  guardar: (token) => sessionStorage.setItem(TOKEN, token),
  borrar: () => sessionStorage.removeItem(TOKEN),
};
export class ErrorApi extends Error {
  constructor(mensaje, estado = 0) {
    super(mensaje);
    this.estado = estado;
  }
}
export async function api(
  ruta,
  { method = 'GET', body, signal, key, publico = false } = {},
) {
  const token = publico ? null : sesion.leer();
  const tiempo = AbortSignal.timeout(20000);
  try {
    const respuesta = await fetch(`/api${ruta}`, {
      method,
      signal: signal ? AbortSignal.any([signal, tiempo]) : tiempo,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      if (respuesta.status === 401 && token && token === sesion.leer()) {
        sesion.borrar();
        window.dispatchEvent(new Event('sesion-expirada'));
      }
      throw new ErrorApi(
        datos?.mensaje ||
          'No pudimos completar la solicitud. Intenta nuevamente.',
        respuesta.status,
      );
    }
    if (datos === null)
      throw new ErrorApi('La respuesta del servidor no es válida.', 502);
    return datos;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ErrorApi) throw error;
    throw new ErrorApi(
      'No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentar.',
    );
  }
}
export const clp = (valor) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 2,
  }).format(valor || 0);
export const fecha = (valor) =>
  valor
    ? new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(valor))
    : '—';
