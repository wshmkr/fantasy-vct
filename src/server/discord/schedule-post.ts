import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tournaments } from "../db/schema.js";
import { scoreTournament } from "../points.js";
import { matchOverviewUrl } from "../vlr/match.js";
import { type DiscordMessage, discord } from "./client.js";
import {
  ACCENT_COLOR,
  BLANK_LINE,
  type ConnectedTournament,
  column,
  discordTime,
  managerLabels,
  PING_NOBODY,
  rosterLines,
  teamBadges,
  withEmoji,
} from "./format.js";

// The group plays from North America, so "today" and the morning post follow Pacific time.
const SCHEDULE_TIME_ZONE = "America/Los_Angeles";
const SCHEDULE_POST_HOUR = 9;

// Discord caps a message at 6000 characters and 25 fields across its embeds.
const MESSAGE_CHARACTER_BUDGET = 5500;
const MAX_FIELDS_PER_MESSAGE = 25;

const pacificDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const pacificHour = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULE_TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});
const pacificDayLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULE_TIME_ZONE,
  weekday: "long",
  month: "short",
  day: "numeric",
});

export interface ScheduledTeam {
  name: string;
  emoji: string | null;
  // Every player and the coach, with the manager of each drafted pick.
  lines: string[];
}

export interface ScheduledMatch {
  scheduledAt: string;
  bestOf: number;
  stageName: string | null;
  vlrMatchUrl: string;
  team1: ScheduledTeam;
  team2: ScheduledTeam;
}

export interface SchedulePost {
  tournamentName: string;
  dayLabel: string;
  matches: ScheduledMatch[];
}

type Field = { name: string; value: string; inline?: boolean };

// Field names can't hold links or timestamps, so the matchup line (linked to VLR) leads with the
// time, and the two columns are headed by their teams. The blank heading above the matchup
// spaces each game from the one before.
function matchFields(match: ScheduledMatch): Field[] {
  const matchup = `[**${match.team1.name} vs ${match.team2.name}**](${match.vlrMatchUrl})`;
  return [
    {
      name: BLANK_LINE,
      value: `${discordTime(match.scheduledAt, "t")} · ${matchup} · Bo${match.bestOf}`,
    },
    column(withEmoji(match.team1.emoji, match.team1.name), match.team1.lines),
    column(withEmoji(match.team2.emoji, match.team2.name), match.team2.lines),
  ];
}

const sizeOf = (fields: Field[]) =>
  fields.reduce(
    (total, { name, value }) => total + name.length + value.length,
    0,
  );

// One message when the day fits. Otherwise it splits between start times, so games that
// start together stay together; a single start time too big for one message splits again.
export function scheduleMessages(post: SchedulePost): DiscordMessage[] {
  const title = `Today's matches · ${post.dayLabel}`;
  // Usually one stage a day, so it's named once at the top rather than on every game.
  const stageNames = [
    ...new Set(post.matches.flatMap(({ stageName }) => stageName ?? [])),
  ].join(" · ");
  const budget = MESSAGE_CHARACTER_BUDGET - title.length - stageNames.length;
  const fits = (fields: Field[]) =>
    sizeOf(fields) <= budget && fields.length <= MAX_FIELDS_PER_MESSAGE;
  const slots = new Map<string, Field[][]>();
  for (const match of post.matches) {
    slots.set(match.scheduledAt, [
      ...(slots.get(match.scheduledAt) ?? []),
      matchFields(match),
    ]);
  }
  const groups: Field[][] = [];
  for (const slot of slots.values()) {
    const slotFields = slot.flat();
    const current = groups.at(-1);
    if (current && fits([...current, ...slotFields])) {
      current.push(...slotFields);
    } else if (fits(slotFields)) {
      groups.push(slotFields);
    } else {
      for (const fields of slot) {
        const last = groups.at(-1);
        if (last && fits([...last, ...fields])) last.push(...fields);
        else groups.push([...fields]);
      }
    }
  }
  return groups.map((fields, index) => ({
    embeds: [
      {
        title: index === 0 ? title : undefined,
        description: index === 0 ? stageNames || undefined : undefined,
        color: ACCENT_COLOR,
        fields,
        footer:
          index === groups.length - 1
            ? { text: post.tournamentName }
            : undefined,
      },
    ],
    allowed_mentions: PING_NOBODY,
  }));
}

export function schedulePostOf(
  tournament: ConnectedTournament,
  now: Date,
): SchedulePost {
  const today = pacificDate.format(now);
  const scores = scoreTournament(tournament.id);
  const managerOf = managerLabels(tournament.id);
  const todays = scores.matches.filter(
    ({ match }) =>
      match.scheduledAt !== null &&
      pacificDate.format(new Date(match.scheduledAt)) === today,
  );
  return {
    tournamentName: tournament.name,
    dayLabel: pacificDayLabel.format(now),
    matches: todays.map(({ match, stageId }) => {
      const stage = scores.stages.find(
        (candidate) => candidate.stage.id === stageId,
      );
      const badgeOf = teamBadges([match.team1Id, match.team2Id]);
      const scheduledTeamOf = (teamId: number | null): ScheduledTeam => ({
        name: badgeOf(teamId).name,
        emoji: badgeOf(teamId).emoji,
        lines: rosterLines(stage, teamId, managerOf),
      });
      return {
        scheduledAt: match.scheduledAt ?? "",
        bestOf: match.bestOf,
        stageName: stage?.stage.name ?? null,
        vlrMatchUrl: matchOverviewUrl(match.vlrId),
        team1: scheduledTeamOf(match.team1Id),
        team2: scheduledTeamOf(match.team2Id),
      };
    }),
  };
}

// Once a day after 9:00 Pacific; a day without matches is marked done without a post.
export async function postDailySchedule(
  tournament: ConnectedTournament,
  now: Date,
) {
  const today = pacificDate.format(now);
  if (
    tournament.discordSchedulePostedOn === today ||
    Number(pacificHour.format(now)) < SCHEDULE_POST_HOUR
  ) {
    return;
  }
  const post = schedulePostOf(tournament, now);
  for (const message of scheduleMessages(post)) {
    await discord.postMessage(tournament.discordChannelId, message);
  }
  db.update(tournaments)
    .set({ discordSchedulePostedOn: today })
    .where(eq(tournaments.id, tournament.id))
    .run();
}
