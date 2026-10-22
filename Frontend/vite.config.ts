import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "push-sw.js", "images/*"],
      manifest: {
        name: "CareBridge — Health Within Reach",
        short_name: "CareBridge",
        description:
          "Find nearby facilities, check symptoms and message a doctor — even offline.",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f5a3c",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,webp,woff2}"],
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/facilities"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "api-facilities" },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/health-tips") ||
              url.pathname.startsWith("/i18n/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-content",
              expiration: { maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              (url.pathname.startsWith("/consultations") ||
                url.pathname.startsWith("/triage") ||
                url.pathname.startsWith("/payments")),
            handler: "NetworkFirst",
            options: { cacheName: "api-records", networkTimeoutSeconds: 3 },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith("tile.openstreetmap.org"),
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
