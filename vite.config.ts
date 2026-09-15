import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

export default defineConfig({
  plugins: [react()],
  server: {
    // O Caddy ocupa a 3120 (HTTPS) e faz reverse_proxy para cá. O dev server
    // escuta só no loopback: quem vem de fora entra obrigatoriamente pelo TLS.
    port: 3121,
    host: "127.0.0.1",
    // O Caddy repassa Host: sankhya.nxboats.com.br
    allowedHosts: ["sankhya.nxboats.com.br"],
    // A página é servida na 3120; sem isso o cliente de HMR tentaria a 3121,
    // que não está publicada.
    hmr: { clientPort: 3120 },
    proxy: {
      // O front chama /api/* relativo (ver src/lib/apiBase.ts); é aqui que o
      // upstream real é resolvido em dev local.
      "/api": {
        target: "http://sankhya.nxboats.com.br:3200",
        changeOrigin: true,
      },
      // Fotos dos funcionários no Sankhya ERP — a 8180 só aceita HTTP.
      "/mge": {
        target: "http://sankhya.nxboats.com.br:8180",
        changeOrigin: true,
      },
    },
  },
  
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
