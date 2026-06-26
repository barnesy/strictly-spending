/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(() => {
  const isTest = process.env.VITEST === 'true';

  return {
    plugins: [react()],
    resolve: {
      alias: isTest ? [] : [
        { find: /^drizzle-orm$/, replacement: path.resolve(__dirname, './src/db/drizzle.ts') }
      ]
    },
    optimizeDeps: {
      include: [
        '@mui/material',
        '@mui/icons-material',
        '@emotion/react',
        '@emotion/styled',
      ]
    },
    server: {
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}']
    }
  }
})
