import { useState } from 'react';
import { Balon } from './Ilustraciones.jsx';
export function rutaImagenLocal(valor) {
  return typeof valor === 'string' && (valor === '/llama.svg' ||
    /^\/productos\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|avif|gif|svg)$/i.test(valor));
}
export function ImagenProducto({ producto, className = '' }) {
  const src = rutaImagenLocal(producto.imagen) && producto.imagen !== '/llama.svg' ? producto.imagen : '';
  // Asociar el fallo a la ruta permite recuperarse al cambiar la vista previa.
  const [fallida, setFallida] = useState(null);
  const [cargada, setCargada] = useState(null);
  const nombre = producto.nombre || 'Producto de gas';
  const peso = producto.peso || nombre.match(/(\d+)\s*kg/i)?.[1] || 15;
  const accesorio = producto.categoria ? producto.categoria !== 'GAS' : !/\b(?:gas\s*\d|bal[oó]n)/i.test(nombre);
  return (
    <span className={`foto-producto ${className}`} data-estado={src && fallida !== src ? cargada === src ? 'lista' : 'cargando' : 'reemplazo'}>
      {src && fallida !== src ? (
        <img key={src} src={src} alt={`Foto de ${nombre}`} width="400" height="300" loading="lazy" decoding="async"
          onLoad={() => setCargada(src)} onError={() => setFallida(src)} />
      ) : (
        <span role="img" aria-label={`${nombre}: imagen de reemplazo`} className="foto-reemplazo">
          <span aria-hidden="true"><Balon peso={peso} accesorio={accesorio} /></span>
        </span>
      )}
    </span>
  );
}
