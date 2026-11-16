/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Serves the Vercel-style handlers in /api during `vite dev` so the app works without `vercel dev`. */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = (req as { url?: string }).url?.match(/^\/api\/([a-z-]+)(?:\?.*)?$/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          await mod.default(req, res);
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end('{"error":"API error"}');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDev()],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'api/**/*.test.js'] },
});
