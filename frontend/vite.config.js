import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages serves the app from /PME-System-1.2/; the deploy workflow sets
  // VITE_BASE to that path. Unset locally, so `npm run dev` stays at "/".
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5173,
    host: true,
    strictPort: true,
  },
})
