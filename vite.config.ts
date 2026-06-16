import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['mapbox-gl', 'react-map-gl/mapbox', 'react', 'react-dom', 'zustand', 'recharts'],
    entries: ['index.html'],
  },
  server: {
    port: 5173,        // always use this port (predictable for APP_URL in .env)
    watch: {
      ignored: ['**/Knwlodge base/**', '**/backend/**', '**/Meeting summary/**'],
    },
    fs: {
      allow: ['.'],
      deny: ['Knwlodge base'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',   // local API server
        changeOrigin: true,
      },
    },
  },
})
