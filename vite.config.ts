import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,        // always use this port (predictable for APP_URL in .env)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',   // local API server
        changeOrigin: true,
      },
    },
  },
})
