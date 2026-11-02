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
    // Vercel dev injects PORT; fall back to 5173 for plain `npm run dev`
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    // No /api proxy here: when running under `vercel dev` the outer Vercel
    // process handles /api routing itself. When running plain `npm run dev`
    // you'd need the proxy, but smoke tests always use `vercel dev`.
  },
});
