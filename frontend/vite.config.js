import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, Vite serves at :5173 and proxies /api requests to FastAPI at :8765.
// In production, FastAPI serves the built static assets — no proxy needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8765',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
