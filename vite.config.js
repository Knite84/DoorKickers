import { defineConfig } from 'vite';

// Relative asset paths so the built game works from a GitHub Pages
// project URL (https://<user>.github.io/<repo>/) as well as from any folder.
export default defineConfig({
  base: './',
});
