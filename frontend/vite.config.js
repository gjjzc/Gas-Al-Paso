import { defineConfig } from 'vite';

export default defineConfig({
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
