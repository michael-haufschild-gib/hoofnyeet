import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // This result-panel dependency is reached through the lazy game interface.
  // Prepare it before serving Pixi's dynamic chunks on a fresh local cache.
  optimizeDeps: { include: ['@base-ui/react/collapsible'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    allowedHosts: ['.localhost'],
    strictPort: true,
    watch: {
      ignored: [
        '**/output/**',
        '**/logs/**',
        '**/.playwright-cli/**',
        '**/test-results/**',
      ],
    },
  },
  preview: {
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    allowedHosts: ['.localhost'],
    strictPort: true,
  },
});
