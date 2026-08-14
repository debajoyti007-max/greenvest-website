import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3000,
    host: true,
  },
  build: {
    // Raise warning limit to 600kB (vendor chunk is expected to be large)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Manual chunk splitting — splits 497KB blob into smaller cacheable pieces
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
        },
      },
    },
    // Enable CSS code splitting per chunk
    cssCodeSplit: true,
    // Target modern browsers for smaller output
    target: 'esnext',
  },
})
