import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const projectRoot = path.join(__dirname, "..");
  const env = loadEnv(mode, projectRoot, "");
  const apiPort = process.env.API_PORT || env.API_PORT || "3001";
  const apiTarget = `http://127.0.0.1:${apiPort}`;
  if (mode === "development") {
    console.info(`[vite] proxy /api -> ${apiTarget}`);
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      host: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
