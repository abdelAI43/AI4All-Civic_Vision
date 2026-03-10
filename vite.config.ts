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
    watch: {
      ignored: ['**/Knwlodge base/**', '**/backend/**', '**/Meeting summary/**'],
    },
    fs: {
      allow: ['.'],
      deny: ['Knwlodge base'],
    },
  },
})
