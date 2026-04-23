import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

export default defineConfig({
  plugins: [react()],
   server: {
    port:3120,
    allowedHosts: ["sankhya.nxboats.com.br"],
    host: true,
     proxy: {
      "/api": {
        target:  "http://sankhya.nxboats.com.br:3200",
        changeOrigin: true,
        // se o backend não usa /api no path base, reescreva:
        // rewrite: (path) => path.replace(/^\/api/, "/api"),
      },
    },
  },
  
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
