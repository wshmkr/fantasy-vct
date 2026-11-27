import { db } from "../db/client.js";
import { backfillMapAverages } from "./backfill-map-averages.js";

const { filledRows, skippedMatchIds } = backfillMapAverages(db);
console.log(`Updated ${filledRows} map stat rows`);
if (skippedMatchIds.length > 0) {
  console.log(
    `Skipped matches with missing or unreadable saved pages: ${skippedMatchIds.join(", ")}`,
  );
}
