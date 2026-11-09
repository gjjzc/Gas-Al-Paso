import { defineConfig, createLogger } from 'vite';

const logger = createLogger();
const registrarError = logger.error.bind(logger);
logger.error = (mensaje, opciones) =>
  registrarError(
    String(mensaje).replace(/([?&]telefono=)[^&\s]*/gi, '$1[oculto]'),
    opciones,
  );
export default defineConfig({
  customLogger: logger,
  // JSX automatico evita exigir import React en cada pantalla.
  esbuild: { jsx: 'automatic' },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
