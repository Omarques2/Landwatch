import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into separate, long-term cacheable chunks so they
        // are not re-downloaded on every app-code change and stay out of the
        // entry chunk. Map libs are further isolated by route-level lazy loading.
        manualChunks: {
          maplibre: ["maplibre-gl", "pmtiles"],
          leaflet: ["leaflet"],
          ui: ["radix-vue"],
          http: ["axios"],
        },
      },
    },
  },
  server: {
    proxy: {
      "/v1": {
        target: process.env.VITE_DEV_API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: process.env.VITE_DEV_API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
