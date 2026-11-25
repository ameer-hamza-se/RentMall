import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'API_PROXY_');
  const proxy = { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:4000' };

  return {
    appType: 'mpa', // Only the public catalog is served as an HTML entry.
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  };
});
