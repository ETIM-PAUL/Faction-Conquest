import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pinned: other local projects occupy 5173+, and the faction-chat edge
  // functions' CORS is locked to one exact origin (FRONTEND_ORIGIN secret)
  // that has to match wherever this actually serves from.
  server: { port: 5180, strictPort: true },
})
