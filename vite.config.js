import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/chess/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@context': path.resolve(__dirname, 'src/lib/context'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@constants': path.resolve(__dirname, 'src/lib/constants'),
      '@api': path.resolve(__dirname, 'src/services/api'),
      '@query': path.resolve(__dirname, 'src/services/query'),
      '@store': path.resolve(__dirname, 'src/services/store'),
      '@public': path.resolve(__dirname, 'public/images'),
      '@assets': path.resolve(__dirname, 'assets'),
    },
  },
}))
