import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Minification provides sufficient protection for most cases
    minify: 'terser',
    terserOptions: {
      mangle: true,
      compress: true
    }
  }
})
