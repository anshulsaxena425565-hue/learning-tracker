import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src',
  plugins: [react()],
  // The app is served from the custom domain root, so nested SPA routes must load assets from /assets.
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
