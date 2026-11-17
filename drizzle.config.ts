import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ quiet: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/app.db" },
});
