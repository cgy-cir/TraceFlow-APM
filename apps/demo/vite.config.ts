import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    server: { port: 5174 },
    base: env.VITE_TRACEFLOW_BASE ?? '/',
    build:
      env.TRACEFLOW_PRIVATE_BUILD === 'true'
        ? { outDir: 'dist-private', sourcemap: 'hidden' as const }
        : {},
  }
})
