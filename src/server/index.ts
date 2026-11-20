import { APP_PRODUCT_NAME } from "../shared/branding.js";
import { createApp } from "./app.js";
import { upsertCommissioner } from "./auth/access.js";
import { db } from "./db/client.js";
import { postFinishedMatches } from "./discord/match-posts.js";
import { env } from "./env.js";
import { startSyncTicker } from "./sync.js";

if (env.COMMISSIONER_DISCORD_USERNAME) {
  upsertCommissioner(env.COMMISSIONER_DISCORD_USERNAME);
}

if (env.SCHEDULER === "on") startSyncTicker(postFinishedMatches);

const app = createApp();

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`${APP_PRODUCT_NAME} running on http://localhost:${env.PORT}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.$client.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => shutdown(sig));
}
