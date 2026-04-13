import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.WORKSPACE_BRIDGE_ORIGIN ?? "http://127.0.0.1:8742";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target,
        changeOrigin: true,
      },
      "/ws": {
        target,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
