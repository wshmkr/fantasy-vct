import { db } from "../db/client.js";
import { tournaments } from "../db/schema.js";
import { postAlerts } from "./alert-post.js";
import { isDiscordBotConfigured } from "./client.js";
import { postDraftResults } from "./draft-post.js";
import type { ConnectedTournament } from "./format.js";
import { postMatchResults, skipMatchResultsBacklog } from "./match-post.js";
import { postMatchStarts, skipMatchStartsBacklog } from "./match-start-post.js";
import { postDailySchedule } from "./schedule-post.js";
import {
  postStageResults,
  skipStageResultsBacklog,
} from "./stage-results-post.js";
import { ensureTeamEmojis } from "./team-emojis.js";

function connectedTournaments(): ConnectedTournament[] {
  return db
    .select()
    .from(tournaments)
    .all()
    .flatMap(({ discordChannelId, discordRoleId, ...tournament }) =>
      discordChannelId && discordRoleId
        ? [{ ...tournament, discordChannelId, discordRoleId }]
        : [],
    );
}

// Called when a channel is connected: what already happened isn't news. The draft results
// still post, so the group sees the teams, and alerts still post, since they need fixing.
export function skipDiscordBacklog(tournamentId: number, now: Date) {
  skipMatchStartsBacklog(tournamentId, now);
  skipMatchResultsBacklog(tournamentId);
  skipStageResultsBacklog(tournamentId);
}

let posting = false;

// Runs after every sync. Each post is marked only once it's sent, so a failure is retried next run.
export async function postDiscordUpdates(now = new Date()): Promise<void> {
  if (posting || !isDiscordBotConfigured()) return;
  posting = true;
  try {
    for (const tournament of connectedTournaments()) {
      await ensureTeamEmojis(tournament.id);
      await postDailySchedule(tournament, now);
      await postDraftResults(tournament);
      await postMatchStarts(tournament, now);
      await postMatchResults(tournament);
      await postStageResults(tournament);
      await postAlerts(tournament);
    }
  } catch (error) {
    console.error(error);
  } finally {
    posting = false;
  }
}
