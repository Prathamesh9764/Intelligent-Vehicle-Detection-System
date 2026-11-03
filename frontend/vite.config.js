// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // or '0.0.0.0'
    port: 5178,
    // VITE_API_BASE=/api — forward API calls to FastAPI the same way the
    // nginx /api/ location does (prefix stripped via proxy_pass trailing /).
    allowedHosts: ['ocrspeed.demo.moodscope.in', '.moodscope.in'],
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});