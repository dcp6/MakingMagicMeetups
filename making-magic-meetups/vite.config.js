import { defineConfig } from 'vite';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const pagesBase = process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/';

export default defineConfig({
  base: pagesBase,
  server: {
    port: 5174
  }
});
