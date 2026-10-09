import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  '/api-proxy': {
    target: 'https://reconcileops-production.up.railway.app',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api-proxy/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
