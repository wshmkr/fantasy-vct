import { importEvent } from "./import.js";

const [eventUrl] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!eventUrl) {
  console.error("Usage: npm run vlr:import -- <VLR event URL> [--refresh]");
  process.exit(1);
}

const tournamentId = await importEvent(eventUrl, {
  refresh: process.argv.includes("--refresh"),
  onProgress: ({ phase, done, total }) =>
    console.log(`${phase} ${done}/${total}`),
});
console.log(`Imported tournament ${tournamentId}`);
