import { eq, inArray } from "drizzle-orm";
import { db as appDb, type Db } from "./db/client.js";
import {
  matches,
  matchMaps,
  playerMapStats,
  teams,
  tournaments,
  tournamentTeams,
} from "./db/schema.js";
import { parseEventPage } from "./vlr/event.js";
import { type Downloader, fetchPage, vlrDownloader } from "./vlr/fetch.js";
import { saveScheduleAndStages } from "./vlr/import.js";
import {
  matchOverviewUrl,
  matchPerformanceUrl,
  type ParsedMatchPage,
  parseMatchPages,
} from "./vlr/match.js";
import { parseMatchesPage } from "./vlr/matches.js";

const RECHECK_INTERVAL_MS = 15 * 60_000;
const SCHEDULE_REFRESH_INTERVAL_MS = 60 * 60_000;
const TICK_INTERVAL_MS = 60_000;
const PLAYERS_PER_TEAM = 5;

type MatchRow = typeof matches.$inferSelect;
type TournamentRow = typeof tournaments.$inferSelect;
type MatchTiming = Pick<
  MatchRow,
  "scheduledAt" | "status" | "scrapeStatus" | "checkedAt"
>;

export interface SyncOptions {
  db?: Db;
  download?: Downloader;
  now?: () => Date;
}

function hasStarted(match: MatchTiming, now: Date): boolean {
  return (
    match.status !== "upcoming" ||
    (match.scheduledAt !== null &&
      Date.parse(match.scheduledAt) <= now.getTime())
  );
}

export function isDue(match: MatchTiming, now: Date): boolean {
  if (match.scrapeStatus === "ok" || !hasStarted(match, now)) return false;
  return (
    match.checkedAt === null ||
    now.getTime() - Date.parse(match.checkedAt) >= RECHECK_INTERVAL_MS
  );
}

function sanityProblem(page: ParsedMatchPage): string | null {
  for (const map of page.finishedMaps) {
    for (const side of [1, 2] as const) {
      const players = map.players.filter((player) => player.side === side);
      if (players.length !== PLAYERS_PER_TEAM) {
        return `Map ${map.mapNo} has ${players.length} players for team ${side}`;
      }
    }
  }
  if (page.status === "completed") {
    const team1MapWins = page.finishedMaps.filter(
      (map) => map.team1Rounds > map.team2Rounds,
    ).length;
    const team2MapWins = page.finishedMaps.length - team1MapWins;
    if (team1MapWins !== page.score1 || team2MapWins !== page.score2) {
      return `Maps ${team1MapWins}-${team2MapWins} don't match the score ${page.score1}-${page.score2}`;
    }
  }
  return null;
}

function saveScrapedMatch(
  db: Db,
  matchId: number,
  page: ParsedMatchPage,
  scrapedAt: string,
) {
  const teamIdByVlrId = new Map(
    db
      .select({ id: teams.id, vlrId: teams.vlrId })
      .from(teams)
      .where(inArray(teams.vlrId, [page.team1VlrId, page.team2VlrId]))
      .all()
      .map((team) => [team.vlrId, team.id]),
  );
  const team1Id = teamIdByVlrId.get(page.team1VlrId);
  const team2Id = teamIdByVlrId.get(page.team2VlrId);
  if (team1Id === undefined || team2Id === undefined) {
    throw new Error("Unknown team");
  }

  db.transaction((tx) => {
    tx.delete(playerMapStats).where(eq(playerMapStats.matchId, matchId)).run();
    tx.delete(matchMaps).where(eq(matchMaps.matchId, matchId)).run();
    for (const { players, ...map } of page.finishedMaps) {
      tx.insert(matchMaps)
        .values({ matchId, ...map })
        .run();
      tx.insert(playerMapStats)
        .values(
          players.map(({ side, ...stats }) => ({
            matchId,
            mapNo: map.mapNo,
            teamId: side === 1 ? team1Id : team2Id,
            ...stats,
          })),
        )
        .run();
    }
    tx.update(matches)
      .set({
        team1Id,
        team2Id,
        bestOf: page.bestOf,
        status: page.status,
        score1: page.score1,
        score2: page.score2,
        scrapeStatus: page.status === "completed" ? "ok" : "pending",
        scrapeError: null,
        scrapedAt,
        checkedAt: scrapedAt,
      })
      .where(eq(matches.id, matchId))
      .run();
  });
}

type SyncContext = Required<SyncOptions>;

function withDefaults({
  db = appDb,
  download = vlrDownloader,
  now = () => new Date(),
}: SyncOptions): SyncContext {
  return { db, download, now };
}

export async function scrapeMatch(
  matchId: number,
  options: SyncOptions = {},
): Promise<void> {
  const { db, download, now } = withDefaults(options);
  const match = db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new Error(`No match ${matchId}`);
  const checkedAt = now().toISOString();
  const source = { db, download, refresh: true };
  try {
    const page = parseMatchPages(
      await fetchPage(source, matchOverviewUrl(match.vlrId)),
      await fetchPage(source, matchPerformanceUrl(match.vlrId)),
    );
    const problem = sanityProblem(page);
    if (problem) throw new Error(problem);
    saveScrapedMatch(db, match.id, page, checkedAt);
  } catch (error) {
    db.update(matches)
      .set({
        scrapeStatus: "failed",
        scrapeError: error instanceof Error ? error.message : String(error),
        checkedAt,
      })
      .where(eq(matches.id, match.id))
      .run();
  }
}

// In memory on purpose: after a restart, the first tick just refreshes every schedule again.
const scheduleRefreshedAt = new Map<number, number>();

// A failed refresh only means stale times, so it's logged and the tournament's matches still get scraped.
async function refreshSchedule(
  tournament: TournamentRow,
  { db, download, now }: SyncContext,
) {
  // Stamped even on failure, so a broken page is retried hourly rather than every tick.
  scheduleRefreshedAt.set(tournament.id, now().getTime());
  try {
    // The event page only supplies the matches URL, so the copy cached at import is enough.
    const { matchesUrl } = parseEventPage(
      await fetchPage({ db, download, refresh: false }, tournament.vlrEventUrl),
    );
    const schedule = parseMatchesPage(
      await fetchPage({ db, download, refresh: true }, matchesUrl),
    );
    const teamIdByName = new Map(
      db
        .select({ name: teams.name, id: teams.id })
        .from(tournamentTeams)
        .innerJoin(teams, eq(teams.id, tournamentTeams.teamId))
        .where(eq(tournamentTeams.tournamentId, tournament.id))
        .all()
        .map((team) => [team.name, team.id]),
    );
    db.transaction((tx) =>
      saveScheduleAndStages(tx, tournament.id, schedule, teamIdByName),
    );
  } catch (error) {
    console.error(error);
  }
}

let running = false;

export function isSyncRunning(): boolean {
  return running;
}

async function runExclusively(job: () => Promise<void>): Promise<void> {
  if (running) return;
  running = true;
  try {
    await job();
  } finally {
    running = false;
  }
}

function matchesOf(db: Db, tournamentId: number): MatchRow[] {
  return db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .all();
}

export function syncDueMatches(options: SyncOptions = {}): Promise<void> {
  const context = withDefaults(options);
  const { db, now } = context;
  return runExclusively(async () => {
    for (const tournament of db.select().from(tournaments).all()) {
      const scheduled = matchesOf(db, tournament.id);
      const ended = scheduled.every((match) => match.status === "completed");
      const lastRefreshAt = scheduleRefreshedAt.get(tournament.id);
      const refreshIsDue =
        lastRefreshAt === undefined ||
        now().getTime() - lastRefreshAt >= SCHEDULE_REFRESH_INTERVAL_MS;
      if (
        !ended &&
        (refreshIsDue || scheduled.some((match) => isDue(match, now())))
      ) {
        await refreshSchedule(tournament, context);
      }
      for (const match of matchesOf(db, tournament.id)) {
        if (isDue(match, now())) await scrapeMatch(match.id, context);
      }
    }
  });
}

export function syncTournament(
  tournamentId: number,
  options: SyncOptions = {},
): Promise<void> {
  const context = withDefaults(options);
  const { db, now } = context;
  return runExclusively(async () => {
    const tournament = db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .get();
    if (!tournament) return;
    await refreshSchedule(tournament, context);
    for (const match of matchesOf(db, tournamentId)) {
      if (match.scrapeStatus !== "ok" && hasStarted(match, now())) {
        await scrapeMatch(match.id, context);
      }
    }
  });
}

export function startSyncTicker() {
  setInterval(() => {
    syncDueMatches().catch((error: unknown) => console.error(error));
  }, TICK_INTERVAL_MS);
}
