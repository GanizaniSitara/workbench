import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webPort = Number.parseInt(process.env.VITE_PORT ?? "3000", 10);
const apiTarget = `http://127.0.0.1:${process.env.PORT ?? "4000"}`;
const apiWsTarget = `ws://127.0.0.1:${process.env.PORT ?? "4000"}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api/jupyter/ws": {
        target: apiWsTarget,
        ws: true,
      },
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
  preview: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
  },
});
