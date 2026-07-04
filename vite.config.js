import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8422,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
  },
});
