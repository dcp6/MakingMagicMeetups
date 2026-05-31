import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Use relative asset paths so the same build works on:
  // - https://<user>.github.io/<repo>/ (subpath)
  // - https://custom-domain/ (root)
  base: './',
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  }
});
