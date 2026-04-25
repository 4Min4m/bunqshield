import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
    allowedHosts: [
      'localhost',
      'd1xtsg7hl4tp01.cloudfront.net'
    ]
  },
})