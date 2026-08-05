import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Respeita a porta atribuída pelo ambiente (ex.: harness de preview); 3000 como padrão local.
    port: Number(process.env.PORT) || 3000
  }
})

