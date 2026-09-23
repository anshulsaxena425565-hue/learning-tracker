import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src',
  plugins: [react()],
  base: '/learning-tracker/',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
