import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: '/learning-tracker/',
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html')
    }
  }
})
