import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { matches } from "../db/schema.js";
import { type ScoredMatch, scoreTournament } from "../points.js";
import { type DiscordMessage, discord } from "./client.js";
import {
  ALERT_COLOR,
  appUrl,
  type ConnectedTournament,
  commissionerDiscordId,
  teamBadges,
} from "./format.js";

export interface AlertPost {
  commissionerDiscordId: string | null;
  matchTitle: string;
  matchesUrl: string;
  problems: string[];
}

// Pings only the commissioner, who is the one who can fix it.
export function alertMessage(post: AlertPost): DiscordMessage {
  const commissioner = post.commissionerDiscordId;
  return {
    content: commissioner ? `<@${commissioner}>` : undefined,
    embeds: [
      {
        title: `${post.matchTitle} needs a fix`,
        url: post.matchesUrl,
        description: [...post.problems, "Fix it in the Matches tab."].join(
          "\n",
        ),
        color: ALERT_COLOR,
      },
    ],
    allowed_mentions: { users: commissioner ? [commissioner] : [] },
  };
}

function problemsOf(scored: ScoredMatch): string[] {
  const failedScrape =
    scored.match.scrapeStatus === "failed"
      ? [`Stats didn't scrape: ${scored.match.scrapeError ?? "unknown error"}`]
      : [];
  const unassignedSubs = scored.pairings.flatMap(({ mapNo, pairing }) =>
    pairing.unassignedSubVlrIds.map((vlrId) => {
      const handle =
        scored.statRows.find(
          (row) => row.mapNo === mapNo && row.vlrPlayerId === vlrId,
        )?.handle ?? vlrId;
      return `**${handle}** subbed in on map ${mapNo}: choose who they replaced.`;
    }),
  );
  return [...failedScrape, ...unassignedSubs];
}

export function alertPostOf(
  tournament: ConnectedTournament,
  scored: ScoredMatch,
): AlertPost {
  const { match } = scored;
  const badgeOf = teamBadges([match.team1Id, match.team2Id]);
  return {
    commissionerDiscordId: commissionerDiscordId(),
    matchTitle: `${badgeOf(match.team1Id).name} vs ${badgeOf(match.team2Id).name}`,
    matchesUrl: appUrl(tournament.id, "matches"),
    problems: problemsOf(scored),
  };
}

// Each finished match is checked once its scrape has settled (ok, or failed), and alerted on
// only if it needs a fix; checking every match once keeps this off the per-minute path.
export async function postAlerts(tournament: ConnectedTournament) {
  const settledIds = new Set(
    db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournament.id),
          eq(matches.status, "completed"),
          inArray(matches.scrapeStatus, ["ok", "failed"]),
          isNull(matches.discordAlertCheckedAt),
        ),
      )
      .all()
      .map(({ id }) => id),
  );
  if (settledIds.size === 0) return;
  for (const scored of scoreTournament(tournament.id).matches) {
    if (!settledIds.has(scored.match.id)) continue;
    if (scored.needsAttention) {
      await discord.postMessage(
        tournament.discordChannelId,
        alertMessage(alertPostOf(tournament, scored)),
      );
    }
    db.update(matches)
      .set({ discordAlertCheckedAt: new Date().toISOString() })
      .where(eq(matches.id, scored.match.id))
      .run();
  }
}
