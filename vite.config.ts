import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project site needs this base; Vercel/Netlify use '/'
  base: process.env.GITHUB_PAGES === '1' ? '/greenvest-website/' : '/',
  server: {
    port: 3000,
    host: true,
  },
})
