import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const optionalString = z
  .string()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_PATH: z.string().default("./data/app.db"),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((s) =>
        s
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    SESSION_SECRET: z.string().min(16),
    BASE_URL: z.url().default("http://localhost:5173"),
    COMMISSIONER_DISCORD_USERNAME: optionalString.transform((username) =>
      username?.toLowerCase(),
    ),
    DISCORD_CLIENT_ID: optionalString,
    DISCORD_CLIENT_SECRET: optionalString,
    DISCORD_BOT_TOKEN: optionalString,
    DEV_LOGIN: z.stringbool().default(false),
    SCHEDULER: z.enum(["on", "off"]).default("on"),
  })
  .refine((env) => env.DEV_LOGIN || env.COMMISSIONER_DISCORD_USERNAME, {
    message: "Required unless DEV_LOGIN",
    path: ["COMMISSIONER_DISCORD_USERNAME"],
  })
  .refine((env) => !(env.DEV_LOGIN && env.NODE_ENV === "production"), {
    message: "DEV_LOGIN is not allowed in production",
    path: ["DEV_LOGIN"],
  });

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "Invalid environment variables:",
      z.treeifyError(result.error),
    );
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env: Env = parseEnv();
