import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../out/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Cache Busting: Include content hash in filenames
        // This ensures V(X) and V(Y) never share the same filename
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
      },
    },
  },
})
