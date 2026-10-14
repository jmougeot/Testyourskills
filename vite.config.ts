import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  publicDir: "public",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    port: 5180,
    proxy: {
      "/api": "http://localhost:8787",
      "/og": "http://localhost:8787",
      "/c/": "http://localhost:8787",
      "/auth": "http://localhost:8787",
      "/avatar": "http://localhost:8787",
    },
  },
});
