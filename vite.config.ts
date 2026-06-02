import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow the cloud port-preview proxy to reach the dev server (it forwards
    // with an external Host header that Vite's host check would otherwise block).
    allowedHosts: true,
  },
})
