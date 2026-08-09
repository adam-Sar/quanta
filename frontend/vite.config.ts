import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite dev server proxies the FastAPI backend on :8000 so the browser
// does not need CORS. The backend does not declare an Allow-Origin yet.
const BACKEND = process.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    // Bind to loopback only. `host: true` makes Vite listen on every
    // interface (0.0.0.0), which on WSL2/Docker-Desktop setups
    // resolves `localhost` to a different IP than where the WS server
    // actually listens, breaking HMR's token-based WebSocket auth
    // ("WebSocket connection to ws://localhost:5173/?token=...
    // failed"). 127.0.0.1 keeps both the HTTP and WS paths on the same
    // host the browser uses.
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
