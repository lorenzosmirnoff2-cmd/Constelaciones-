import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// El cliente habla con el servidor de sesiones (Socket.IO) en :4000.
// En desarrollo se accede por proxy para que todo viva en el mismo origen.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '..', 'shared'),
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: [path.resolve(__dirname, '..')] },
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
