import {defineConfig} from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  envDir: '../',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
    hmr: {
      port: 5173,
    },
    allowedHosts: [
      'beta-convenient-actors-jim.trycloudflare.com'
    ],
  },
});