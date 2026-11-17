import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    env: {
      DATABASE_PATH: ":memory:",
      SESSION_SECRET: "test-session-secret-0123456789",
      BASE_URL: "http://localhost:5173",
      COMMISSIONER_DISCORD_USERNAME: "commish",
      DISCORD_CLIENT_ID: "test-client-id",
      DISCORD_CLIENT_SECRET: "test-client-secret",
      DEV_LOGIN: "true",
    },
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test-setup.ts",
        "src/client/main.tsx",
        "src/client/theme.ts",
        "src/client/assets.d.ts",
        "src/server/index.ts",
        "src/server/db/seed-dev.ts",
        "src/server/test-utils.ts",
      ],
    },
  },
});
