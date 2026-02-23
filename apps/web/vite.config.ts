import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Qoomb - Family Organization',
        short_name: 'Qoomb',
        description: 'Privacy-first family organization platform',
        theme_color: '#F5C400',
        background_color: '#0F0F0E',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Match tRPC endpoints (both localhost and IP-based URLs)
            urlPattern: /\/trpc\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'trpc-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes (short cache for dev)
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Legacy pattern for api.* subdomains (if used in production)
            urlPattern: /^https:\/\/api\..*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Disable service worker in dev to prevent caching issues
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Resolve @qoomb packages directly from source so HMR works without rebuilding
      '@qoomb/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@qoomb/types': path.resolve(__dirname, '../../packages/types/src'),
      '@qoomb/validators': path.resolve(__dirname, '../../packages/validators/src'),
      // sanitize-html uses Node.js built-ins (path, fs, postcss) — stub it for
      // the browser. It is only ever called server-side, never in client code.
      'sanitize-html': path.resolve(__dirname, './src/lib/sanitize-html-stub.ts'),
    },
  },
  server: {
    port: 5173,
    host: true, // Listen on all network interfaces (0.0.0.0)
    // Allow all hosts in dev for mobile testing (IP addresses, localhost, etc.)
    // In production, this would be restricted to specific domains
  },
});
