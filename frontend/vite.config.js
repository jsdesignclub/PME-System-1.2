import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The frontend calls relative paths like /api/v1/... and Vite forwards them
    // to the backend. This is the important line in this file: without it every
    // development request is cross-origin and depends on CORS behaving
    // correctly. With it the browser sees a single origin, and CORS only
    // matters at deployment.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
