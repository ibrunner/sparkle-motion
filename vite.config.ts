import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // Pre-bundle the CJS wasm module so its first dynamic import doesn't
    // trigger a mid-session dev-server reload.
    include: ['libheif-js/wasm-bundle'],
  },
  server: {
    watch: {
      // Playwright MCP writes screenshots/uploads here during browser testing;
      // don't let them trigger dev-server reloads.
      ignored: ['**/.playwright-mcp/**'],
    },
  },
});
