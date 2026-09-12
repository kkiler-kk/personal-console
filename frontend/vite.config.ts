import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    port: 3000,
    proxy: {
      // 后端 CORS 白名单只含 localhost:3000；改写代理请求的 Origin，
      // 使任意 dev 端口（如 3001）经代理访问后端不被 403
      "/api": { target: "http://localhost:8080", changeOrigin: true, headers: { Origin: "http://localhost:3000" } },
      "/uploads": { target: "http://localhost:8080", changeOrigin: true, headers: { Origin: "http://localhost:3000" } },
    },
  },
})
