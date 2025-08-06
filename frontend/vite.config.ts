import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isDevelopment = mode === 'development'
  const isProduction = mode === 'production'
  const isTest = mode === 'test'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: true,
      host: true, // Allow external connections in development
    },
    build: {
      outDir: 'dist',
      // Environment-specific source map configuration
      sourcemap: isDevelopment,
      // Production optimization
      minify: isProduction ? 'esbuild' : false,
      // Code splitting and chunk size management
      rollupOptions: {
        output: {
          manualChunks: isProduction ? {
            vendor: ['react', 'react-dom']
          } : undefined,
        },
      },
      // Chunk size warning limit
      chunkSizeWarningLimit: 1000,
      // Target modern browsers in production
      target: isProduction ? 'esnext' : 'es2015',
    },
    // Environment-specific define replacements
    define: {
      __DEV__: isDevelopment,
      __PROD__: isProduction,
      __TEST__: isTest,
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    // Enable HMR in development
    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test-setup.ts',
    },
  }
})