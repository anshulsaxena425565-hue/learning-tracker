import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src',
  plugins: [react()],
  // Relative assets work on both the custom domain and GitHub Pages project URLs.
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
