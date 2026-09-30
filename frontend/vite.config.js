import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig(({ mode }) => {
  const serverConfig = loadEnv(mode, projectRoot, "API_PROXY_TARGET");
  const apiTarget = serverConfig.API_PROXY_TARGET || "http://localhost:4000";
  return {
    envDir: projectRoot,
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          configure(proxy) {
            proxy.on("error", (error, request, response) => {
              console.error(
                `[vite] API proxy failed: ${request.method} ${request.url} -> ${apiTarget}. ` +
                `Confirm the Express API is listening and check PORT/API_PROXY_TARGET. ${error.message}`
              );
              if (response && !response.headersSent && !response.writableEnded) {
                response.writeHead(502, { "Content-Type": "application/json" });
                response.end(JSON.stringify({
                  error: `API proxy could not reach ${apiTarget}. Confirm the Express API is running on its configured port.`
                }));
              }
            });
          }
        }
      }
    }
  };
});
