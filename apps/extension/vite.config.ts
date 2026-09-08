import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': here('./src'),
      '@zca/shared': here('../../packages/shared/src/index.ts'),
      '@zca/providers': here('../../packages/providers/src/index.ts'),
      '@zca/router-core': here('../../packages/router-core/src/index.ts'),
      '@zca/pricing': here('../../packages/pricing/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    rollupOptions: {
      input: {
        sidepanel: here('./sidepanel.html'),
        background: here('./src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
