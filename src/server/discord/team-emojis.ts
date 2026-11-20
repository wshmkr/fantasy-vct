import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { images, teams, tournamentTeams } from "../db/schema.js";
import { discord } from "./client.js";
import { type Backdrop, emojiImageOf } from "./emoji-image.js";

// Logo formats sharp can read; a team with any other format keeps its text tag.
const LOGO_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const DARK_LOGO_BACKDROP: Backdrop = "lightDisc";

const MAX_EMOJI_NAME_LENGTH = 32;

// Discord shows an emoji's name on hover, so it's the team name squeezed into emoji
// rules (2–32 letters, digits or underscores): "Shopify Rebellion Black" → Shopify_Rebellion_Black.
export function teamEmojiName(teamName: string, teamVlrId: string): string {
  const name = teamName
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_EMOJI_NAME_LENGTH);
  return name.length >= 2 ? name : `team_${teamVlrId}`;
}

// Uploads each team's logo once as an emoji owned by the bot. Emojis belong to the team,
// not the tournament, so later tournaments with the same team reuse it.
// A team whose upload fails just keeps its text tag in posts.
export async function ensureTeamEmojis(tournamentId: number): Promise<void> {
  const missing = db
    .select({
      id: teams.id,
      vlrId: teams.vlrId,
      name: teams.name,
      contentType: images.contentType,
      bytes: images.bytes,
    })
    .from(tournamentTeams)
    .innerJoin(teams, eq(teams.id, tournamentTeams.teamId))
    .innerJoin(images, eq(images.id, teams.logoImageId))
    .where(
      and(
        eq(tournamentTeams.tournamentId, tournamentId),
        isNull(teams.discordEmoji),
        inArray(images.contentType, LOGO_IMAGE_TYPES),
      ),
    )
    .all();
  if (missing.length === 0) return;
  let uploadedIdByName: Map<string, string>;
  try {
    // An emoji uploaded before (say, before a database restore) is reused rather than duplicated.
    uploadedIdByName = new Map(
      (await discord.listApplicationEmojis()).map(({ id, name }) => [name, id]),
    );
  } catch (error) {
    console.error(error);
    return;
  }
  for (const team of missing) {
    const name = teamEmojiName(team.name, team.vlrId);
    try {
      const emojiId =
        uploadedIdByName.get(name) ??
        (await discord.createApplicationEmoji(name, {
          contentType: "image/png",
          bytes: await emojiImageOf(team.bytes, DARK_LOGO_BACKDROP),
        }));
      db.update(teams)
        .set({ discordEmoji: `<:${name}:${emojiId}>` })
        .where(eq(teams.id, team.id))
        .run();
    } catch (error) {
      console.error(error);
    }
  }
}
