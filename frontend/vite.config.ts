import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/** Live bundle origin. Override with API_PROXY_TARGET for a Render (or other) API. */
const DEFAULT_API_PROXY_TARGET =
  'https://reconcileops-production.up.railway.app'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET
  const apiProxy = {
    '/api-proxy': {
      target: apiProxyTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api-proxy/, ''),
    },
  }

  return {
    plugins: [react()],
    server: {
      proxy: apiProxy,
    },
    preview: {
      proxy: apiProxy,
    },
  }
})
