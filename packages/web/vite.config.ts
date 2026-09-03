import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* In development the monitor runs on Vite's own port and the daemon on a
   random loopback port, so /api is proxied. The proxy adds the token and drops
   the browser's Origin header, which keeps both out of the page: the daemon
   only ever sees a same-process request. `magnetar web` exports both values. */
const daemon = process.env.MAGNETAR_DAEMON_ORIGIN ?? "http://127.0.0.1:7391";
const token = process.env.MAGNETAR_DAEMON_TOKEN ?? "";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": {
        target: daemon,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            if (token) proxyReq.setHeader("authorization", `Bearer ${token}`);
          });
        },
      },
    },
  },
});
