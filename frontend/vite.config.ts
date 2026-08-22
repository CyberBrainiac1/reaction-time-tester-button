import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  // Relative assets work both at localhost and under /repository-name/ on Pages.
  base: './',
  plugins: [react()],
})
