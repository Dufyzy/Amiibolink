import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      filename: 'sw.js',
      manifestFilename: 'manifest.json',
      injectRegister: false,
      manifest: {
        id: './',
        name: 'Amiibolink Studio',
        short_name: 'Amiibolink',
        description: 'Biblioteca sin conexión para Amiibolink Clásico.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#0c1411',
        background_color: '#0c1411',
        categories: ['utilities', 'entertainment'],
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,json,woff2,png}', 'showcase/link.webp'],
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
