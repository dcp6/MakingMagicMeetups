import { defineConfig } from 'vite';

export default defineConfig({
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
