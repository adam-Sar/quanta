import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const datasetProxy: ProxyOptions = {
  target: 'http://localhost:8000',
  changeOrigin: true,
  bypass(request) {
    const accept = request.headers.accept ?? ''
    return accept.includes('text/html') ? '/index.html' : undefined
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://localhost:8000',
      '/datasets': datasetProxy,
      '/metrics': 'http://localhost:8000',
      '/limits': 'http://localhost:8000',
    },
  },
})
