import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    // proxy API calls to the Vercel dev server (same origin in vercel dev)
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
