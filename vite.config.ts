import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // `--mode demo` builds the server-free demo (in-browser database) for static hosting.
  const demo = mode === 'demo' || loadEnv(mode, process.cwd()).VITE_DEMO === '1'
  return {
    base: demo ? (process.env.DEMO_BASE ?? '/') : '/',
    build: { target: 'es2022' },
    optimizeDeps: { exclude: ['@electric-sql/pglite'] },
    plugins: [
      react(),
      tailwindcss(),
      // The demo ships a large WebAssembly database, so it gets no offline cache; its
      // self-destroying worker removes one left behind by an earlier non-demo deploy.
      VitePWA({
        selfDestroying: demo,
        registerType: 'autoUpdate',
        manifest: {
          name: 'Parking',
          short_name: 'Parking',
          theme_color: '#1d4ed8',
          background_color: '#f8fafc',
          display: 'standalone',
          icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
      }),
    ],
  }
})
