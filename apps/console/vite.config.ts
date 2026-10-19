import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { vertexShifaWeb } from '@vertex-shifa/ui/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // The router plugin must run before the React plugin. `vertexShifaWeb` serves `theme-init.js`
  // (the theme before the first paint) and preloads the first screen's fonts.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    vertexShifaWeb(),
  ],
  // The console calls the API on its own origin: the session cookie is `SameSite=Strict` and every
  // write's `Origin` must be the console's (spec S02 rule 39). In development Vite forwards `/api`
  // to the local API (`API_PORT`, 3000 in `.env.example`); the built app sits behind the host's
  // proxy.
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
  preview: { port: 4174, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
