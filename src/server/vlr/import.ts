import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type {
  ImportProgress,
  PickableKind,
  TopAgent,
} from "../../shared/entities.js";
import { db as appDb, type Db } from "../db/client.js";
import {
  matches,
  pickables,
  stagePool,
  stages,
  teams,
  tournaments,
  tournamentTeams,
} from "../db/schema.js";
import {
  type ParsedEventTeam,
  type ParsedPerson,
  parseEventPage,
  parseEventTeams,
  vlrEventIdFromUrl,
} from "./event.js";
import {
  type Downloader,
  fetchPage,
  type VlrSource,
  vlrDownloader,
} from "./fetch.js";
import { DEFAULT_PLAYER_PICTURE_URL, storeImage } from "./images.js";
import {
  ALL_STAGES_KEY,
  type ParsedMatch,
  type ParsedSchedule,
  type ParsedStage,
  parseMatchesPage,
} from "./matches.js";
import {
  type FormStats,
  type ParsedAgent,
  parsePlayerPage,
  playerFormUrl,
} from "./player.js";
import { parseTeamPage } from "./team.js";

export interface ImportOptions {
  refresh?: boolean;
  onProgress?: (progress: ImportProgress) => void;
  db?: Db;
  download?: Downloader;
}

type PersonLink = Omit<ParsedPerson, "handle"> & { handle?: string };

interface ScrapedPerson extends ParsedPerson {
  photoImageId: number;
  topAgents: TopAgent[];
  form: FormStats | null;
}

interface ScrapedTeam extends Omit<ParsedEventTeam, "registeredPlayers"> {
  tag: string | null;
  logoImageId: number | null;
  players: ScrapedPerson[];
  headCoach: ScrapedPerson | null;
}

interface ScrapedEvent {
  vlrEventId: string;
  name: string;
  logoImageId: number | null;
  endsOn: string | null;
  teams: ScrapedTeam[];
  stages: ParsedStage[];
  matches: ParsedMatch[];
  defaultPictureId: number;
}

export async function importEvent(
  eventUrl: string,
  {
    refresh = false,
    onProgress = () => {},
    db = appDb,
    download = vlrDownloader,
  }: ImportOptions = {},
): Promise<number> {
  const source: VlrSource = { db, download, refresh };
  const scraped = await scrapeEvent(source, eventUrl, onProgress);
  return db.transaction((tx) => saveEvent(tx, eventUrl, scraped));
}

// Saving only adds new stages and only touches the pools of stages still in setup, so a
// re-import is the same operation as the first import.
export async function reimportTournament(
  tournamentId: number,
  options: ImportOptions = {},
): Promise<void> {
  const database = options.db ?? appDb;
  const tournament = database
    .select({ vlrEventUrl: tournaments.vlrEventUrl })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!tournament) throw new Error("Tournament not found");
  await importEvent(tournament.vlrEventUrl, { refresh: true, ...options });
}

async function scrapeEvent(
  source: VlrSource,
  eventUrl: string,
  onProgress: (progress: ImportProgress) => void,
): Promise<ScrapedEvent> {
  const event = parseEventPage(await fetchPage(source, eventUrl));
  const eventPageCount = event.otherStagePageUrls.length + 2;
  onProgress({ phase: "event", done: 1, total: eventPageCount });

  const eventTeams = new Map(event.teams.map((team) => [team.vlrId, team]));
  for (const [index, stagePageUrl] of event.otherStagePageUrls.entries()) {
    for (const team of parseEventTeams(await fetchPage(source, stagePageUrl))) {
      if (!eventTeams.has(team.vlrId)) eventTeams.set(team.vlrId, team);
    }
    onProgress({ phase: "event", done: index + 2, total: eventPageCount });
  }
  const schedule = parseMatchesPage(await fetchPage(source, event.matchesUrl));
  onProgress({ phase: "event", done: eventPageCount, total: eventPageCount });

  const rosters = [];
  for (const [index, eventTeam] of [...eventTeams.values()].entries()) {
    const { registeredPlayers, ...team } = eventTeam;
    // The team page is still needed for the head coach; its players are only a fallback.
    const teamPage = parseTeamPage(await fetchPage(source, team.vlrUrl));
    rosters.push({
      team: { ...team, tag: teamPage.tag },
      players:
        registeredPlayers.length > 0 ? registeredPlayers : teamPage.players,
      headCoach: teamPage.headCoach,
    });
    onProgress({ phase: "teams", done: index + 1, total: eventTeams.size });
  }

  const personCount = rosters.reduce(
    (count, roster) =>
      count + roster.players.length + (roster.headCoach ? 1 : 0),
    0,
  );
  let peopleDone = 0;
  const scrapeWithProgress = async (
    person: ParsedPerson,
    kind: PickableKind,
  ) => {
    const scraped = await scrapePerson(source, person, kind);
    peopleDone += 1;
    onProgress({ phase: "players", done: peopleDone, total: personCount });
    return scraped;
  };

  const scrapedTeams: ScrapedTeam[] = [];
  for (const { team, players, headCoach } of rosters) {
    const scrapedPlayers = [];
    for (const player of players) {
      scrapedPlayers.push(await scrapeWithProgress(player, "player"));
    }
    scrapedTeams.push({
      ...team,
      logoImageId: team.logoUrl ? await storeImage(source, team.logoUrl) : null,
      players: scrapedPlayers,
      headCoach: headCoach
        ? await scrapeWithProgress(headCoach, "coach")
        : null,
    });
  }

  return {
    vlrEventId: vlrEventIdFromUrl(eventUrl),
    name: event.name,
    logoImageId: event.logoUrl ? await storeImage(source, event.logoUrl) : null,
    endsOn: event.endsOn,
    teams: scrapedTeams,
    stages:
      schedule.stages.length > 0
        ? schedule.stages
        : [{ key: ALL_STAGES_KEY, name: event.name }],
    matches: schedule.matches,
    defaultPictureId: await storeImage(source, DEFAULT_PLAYER_PICTURE_URL),
  };
}

export async function scrapePerson(
  source: VlrSource,
  person: PersonLink,
  kind: PickableKind,
): Promise<ScrapedPerson> {
  const isPlayer = kind === "player";
  const page = parsePlayerPage(
    await fetchPage(
      source,
      isPlayer ? playerFormUrl(person.vlrUrl) : person.vlrUrl,
    ),
  );
  const handle = person.handle ?? page.handle;
  if (!handle) throw new Error(`No player name on ${person.vlrUrl}`);
  return {
    ...person,
    handle,
    photoImageId: await storeImage(source, page.photoUrl),
    topAgents: isPlayer ? await storeAgentIcons(source, page.topAgents) : [],
    form: isPlayer ? page.form : null,
  };
}

async function storeAgentIcons(
  source: VlrSource,
  agents: ParsedAgent[],
): Promise<TopAgent[]> {
  const stored: TopAgent[] = [];
  for (const agent of agents) {
    stored.push({
      name: agent.name,
      imageId: await storeImage(source, agent.iconUrl),
    });
  }
  return stored;
}

export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

function saveEvent(
  tx: Transaction,
  eventUrl: string,
  event: ScrapedEvent,
): number {
  const tournamentId = tx
    .insert(tournaments)
    .values({
      name: event.name,
      vlrEventUrl: eventUrl,
      vlrEventId: event.vlrEventId,
      logoImageId: event.logoImageId,
      vlrEndsOn: event.endsOn,
    })
    .onConflictDoUpdate({
      target: tournaments.vlrEventId,
      set: {
        name: event.name,
        logoImageId: event.logoImageId,
        vlrEndsOn: event.endsOn,
      },
    })
    .returning({ id: tournaments.id })
    .get().id;

  const teamIdByName = new Map<string, number>();
  for (const team of event.teams) {
    const teamId = tx
      .insert(teams)
      .values({
        vlrId: team.vlrId,
        name: team.name,
        tag: team.tag,
        logoImageId: team.logoImageId,
      })
      .onConflictDoUpdate({
        target: teams.vlrId,
        set: {
          name: team.name,
          // A tag set by hand survives re-imports of a team VLR gives no tag.
          tag: sql`coalesce(excluded.tag, ${teams.tag})`,
          logoImageId: team.logoImageId,
        },
      })
      .returning({ id: teams.id })
      .get().id;
    tx.insert(tournamentTeams)
      .values({ tournamentId, teamId })
      .onConflictDoNothing()
      .run();
    teamIdByName.set(team.name, teamId);
    const coachId =
      manuallySetCoachId(tx, teamId) ??
      (team.headCoach
        ? savePerson(tx, teamId, "coach", team.headCoach)
        : savePlaceholderCoach(tx, teamId, team.name, event.defaultPictureId));
    const rosterIds = [
      ...team.players.map((player) => savePerson(tx, teamId, "player", player)),
      coachId,
    ];
    tx.update(pickables)
      .set({ onRoster: false })
      .where(
        and(
          eq(pickables.teamId, teamId),
          eq(pickables.rosterSetManually, false),
          notInArray(pickables.id, rosterIds),
        ),
      )
      .run();
  }

  saveScheduleAndStages(tx, tournamentId, event, teamIdByName);
  reseedSetupPools(tx, tournamentId);
  return tournamentId;
}

// Once a match page is scraped, its best-of and teams are VLR's real ones, not the list's guesses.
const unlessScraped = (column: AnySQLiteColumn) =>
  sql`case when ${matches.scrapedAt} is null then excluded.${sql.identifier(column.name)} else ${column} end`;

// The list can lag the match page, so it never overrides a result the scrape already confirmed.
const unlessScrapedOk = (column: AnySQLiteColumn) =>
  sql`case when ${matches.scrapeStatus} = 'ok' then ${column} else excluded.${sql.identifier(column.name)} end`;

// Import and sync both go through here, so stage keys are snapshotted before any of their matches are stored.
export function saveScheduleAndStages(
  tx: Transaction,
  tournamentId: number,
  schedule: ParsedSchedule,
  teamIdByName: Map<string, number>,
) {
  const stageKeysSeenBefore = stageKeysOfStoredMatches(tx, tournamentId);
  saveSchedule(tx, tournamentId, schedule.matches, teamIdByName);
  addNewStages(tx, tournamentId, schedule.stages, stageKeysSeenBefore);
}

function saveSchedule(
  tx: Transaction,
  tournamentId: number,
  scheduledMatches: ParsedMatch[],
  teamIdByName: Map<string, number>,
) {
  const teamIdOf = (name: string | null) =>
    name === null ? null : (teamIdByName.get(name) ?? null);
  for (const match of scheduledMatches) {
    const values = {
      tournamentId,
      stageKey: match.stageKey,
      team1Id: teamIdOf(match.team1Name),
      team2Id: teamIdOf(match.team2Name),
      bestOf: match.bestOf,
      scheduledAt: match.scheduledAt,
      status: match.status,
      score1: match.score1,
      score2: match.score2,
    };
    tx.insert(matches)
      .values({ vlrId: match.vlrId, ...values })
      .onConflictDoUpdate({
        target: matches.vlrId,
        set: {
          ...values,
          team1Id: unlessScraped(matches.team1Id),
          team2Id: unlessScraped(matches.team2Id),
          bestOf: unlessScraped(matches.bestOf),
          status: unlessScrapedOk(matches.status),
          score1: unlessScrapedOk(matches.score1),
          score2: unlessScrapedOk(matches.score2),
        },
      })
      .run();
  }
}

// A commissioner's roster edit outranks VLR, so imports keep that pickable's team and roster status.
const unlessSetManually = (column: AnySQLiteColumn, importedValue: unknown) =>
  sql`case when ${pickables.rosterSetManually} then ${column} else ${importedValue} end`;

export function savePerson(
  tx: Transaction,
  teamId: number,
  kind: PickableKind,
  person: ScrapedPerson,
  { setManually = false } = {},
): number {
  const values = {
    kind,
    handle: person.handle,
    teamId,
    vlrUrl: person.vlrUrl,
    photoImageId: person.photoImageId,
    topAgentsJson: person.topAgents,
    formRating: person.form?.rating ?? null,
    formAcs: person.form?.acs ?? null,
    formKd: person.form?.kd ?? null,
    formRounds: person.form?.rounds ?? null,
    formFetchedAt: kind === "player" ? new Date().toISOString() : null,
    onRoster: true,
  };
  return tx
    .insert(pickables)
    .values({ vlrId: person.vlrId, ...values, rosterSetManually: setManually })
    .onConflictDoUpdate({
      target: pickables.vlrId,
      set: setManually
        ? { ...values, rosterSetManually: true }
        : {
            ...values,
            kind: unlessSetManually(pickables.kind, kind),
            teamId: unlessSetManually(pickables.teamId, teamId),
            onRoster: unlessSetManually(pickables.onRoster, 1),
          },
    })
    .returning({ id: pickables.id })
    .get().id;
}

// A coach the commissioner picked stays the team's only coach, whatever VLR lists.
function manuallySetCoachId(tx: Transaction, teamId: number) {
  return tx
    .select({ id: pickables.id })
    .from(pickables)
    .where(
      and(
        eq(pickables.teamId, teamId),
        eq(pickables.kind, "coach"),
        eq(pickables.onRoster, true),
        eq(pickables.rosterSetManually, true),
      ),
    )
    .get()?.id;
}

function savePlaceholderCoach(
  tx: Transaction,
  teamId: number,
  teamName: string,
  defaultPictureId: number,
): number {
  const existing = tx
    .select({ id: pickables.id })
    .from(pickables)
    .where(and(eq(pickables.teamId, teamId), eq(pickables.isPlaceholder, true)))
    .get();
  if (existing) {
    tx.update(pickables)
      .set({ onRoster: true })
      .where(
        and(
          eq(pickables.id, existing.id),
          eq(pickables.rosterSetManually, false),
        ),
      )
      .run();
    return existing.id;
  }
  return tx
    .insert(pickables)
    .values({
      kind: "coach",
      handle: `${teamName} Coach`,
      teamId,
      isPlaceholder: true,
      photoImageId: defaultPictureId,
    })
    .returning({ id: pickables.id })
    .get().id;
}

function stageKeysOfStoredMatches(
  tx: Transaction,
  tournamentId: number,
): string[] {
  return tx
    .selectDistinct({ stageKey: matches.stageKey })
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .all()
    .map((match) => match.stageKey);
}

// A key whose matches were already stored belongs to a stage the commissioner has seen;
// if no stage row has it any more, they deleted it, so it must not come back.
function addNewStages(
  tx: Transaction,
  tournamentId: number,
  vlrStages: ParsedStage[],
  stageKeysSeenBefore: string[],
) {
  const existing = tx
    .select({ position: stages.position, keys: stages.vlrStageKeysJson })
    .from(stages)
    .where(eq(stages.tournamentId, tournamentId))
    .all();
  const knownKeys = new Set([
    ...existing.flatMap((stage) => stage.keys),
    ...stageKeysSeenBefore,
  ]);
  let nextPosition =
    Math.max(-1, ...existing.map((stage) => stage.position)) + 1;
  for (const stage of vlrStages) {
    if (knownKeys.has(stage.key)) continue;
    tx.insert(stages)
      .values({
        tournamentId,
        name: stage.name,
        position: nextPosition++,
        vlrStageKeysJson: [stage.key],
        source: "vlr",
      })
      .run();
  }
}

// A stage's pool is the rosters of the teams named in its matches, or every team while none are.
// TBD slots don't widen it: a bracket's later rounds stay TBD long after its teams are known.
export function reseedSetupPools(tx: Transaction, tournamentId: number) {
  const setupStages = tx
    .select({ id: stages.id, keys: stages.vlrStageKeysJson })
    .from(stages)
    .where(
      and(
        eq(stages.tournamentId, tournamentId),
        eq(stages.status, "setup"),
        eq(stages.source, "vlr"),
      ),
    )
    .all();
  const rosterIdsByTeamId = new Map<number, number[]>(
    tx
      .select({ teamId: tournamentTeams.teamId })
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, tournamentId))
      .all()
      .map(({ teamId }) => [teamId, []]),
  );
  for (const { id, teamId } of tx
    .select({ id: pickables.id, teamId: pickables.teamId })
    .from(pickables)
    .where(
      and(
        inArray(pickables.teamId, [...rosterIdsByTeamId.keys()]),
        eq(pickables.onRoster, true),
      ),
    )
    .all()) {
    rosterIdsByTeamId.get(teamId)?.push(id);
  }
  const allTeamIds = [...rosterIdsByTeamId.keys()];

  for (const stage of setupStages) {
    const stageMatches =
      stage.keys.length === 0
        ? []
        : tx
            .select({ team1Id: matches.team1Id, team2Id: matches.team2Id })
            .from(matches)
            .where(
              and(
                eq(matches.tournamentId, tournamentId),
                inArray(matches.stageKey, stage.keys),
              ),
            )
            .all();
    const namedTeamIds = new Set(
      stageMatches.flatMap((match) =>
        [match.team1Id, match.team2Id].filter((teamId) => teamId !== null),
      ),
    );
    const stageTeamIds =
      namedTeamIds.size === 0 ? allTeamIds : [...namedTeamIds];
    const pickableIds = stageTeamIds.flatMap(
      (teamId) => rosterIdsByTeamId.get(teamId) ?? [],
    );

    for (const pickableId of pickableIds) {
      tx.insert(stagePool)
        .values({ stageId: stage.id, pickableId })
        .onConflictDoNothing()
        .run();
    }
    tx.delete(stagePool)
      .where(
        and(
          eq(stagePool.stageId, stage.id),
          notInArray(stagePool.pickableId, pickableIds),
        ),
      )
      .run();
  }
}
