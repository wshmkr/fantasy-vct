import { z } from "zod";
import {
  type DraftControl,
  MANAGER_COLORS,
  MAX_PICK_SECONDS,
  type ManagerColor,
  type MatchStatus,
  MIN_PICK_SECONDS,
  PICKABLE_KINDS,
  type Pickable,
  type ScrapeStatus,
  type Team,
  type TeamSide,
  type User,
} from "./entities.js";
import type { MapStatLine, ScoringConfig } from "./scoring.js";

export interface HealthResponse {
  ok: boolean;
  uptimeSeconds: number;
  startedAt: string;
}

export interface ApiError {
  error: string;
}

type Id = number | string;

export const API_ROUTES = {
  health: "/api/health",
  me: "/api/me",
  authDiscord: "/api/auth/discord",
  authDiscordCallback: "/api/auth/discord/callback",
  authDev: "/api/auth/dev",
  authDevUsers: "/api/auth/dev/users",
  authLogout: "/api/auth/logout",
  members: "/api/members",
  member: (userId: Id) => `/api/members/${userId}`,
  tournaments: "/api/tournaments",
  tournament: (tournamentId: Id) => `/api/tournaments/${tournamentId}`,
  tournamentTeams: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/teams`,
  tournamentMembers: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/members`,
  myTournamentMembership: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/members/me`,
  tournamentMember: (tournamentId: Id, userId: Id) =>
    `/api/tournaments/${tournamentId}/members/${userId}`,
  tournamentReimport: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/reimport`,
  tournamentSync: (tournamentId: Id) => `/api/tournaments/${tournamentId}/sync`,
  tournamentDiscord: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/discord`,
  tournamentStandings: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/standings`,
  tournamentMatches: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/matches`,
  tournamentLeaderboard: (tournamentId: Id) =>
    `/api/tournaments/${tournamentId}/leaderboard`,
  match: (matchId: Id) => `/api/matches/${matchId}`,
  matchSubs: (matchId: Id) => `/api/matches/${matchId}/subs`,
  teamRoster: (teamId: Id) => `/api/teams/${teamId}/roster`,
  teamRosterEntry: (teamId: Id, pickableId: Id) =>
    `/api/teams/${teamId}/roster/${pickableId}`,
  stage: (stageId: Id) => `/api/stages/${stageId}`,
  stagePool: (stageId: Id) => `/api/stages/${stageId}/pool`,
  stagePoolEntry: (stageId: Id, pickableId: Id) =>
    `/api/stages/${stageId}/pool/${pickableId}`,
  draft: (stageId: Id) => `/api/stages/${stageId}/draft`,
  draftActions: (stageId: Id) => `/api/stages/${stageId}/draft/actions`,
  draftStream: (stageId: Id) => `/api/stages/${stageId}/draft/stream`,
  draftControl: (stageId: Id, control: DraftControl) =>
    `/api/stages/${stageId}/draft/${control}`,
  importJob: (importId: Id) => `/api/imports/${importId}`,
  image: (imageId: Id) => `/api/images/${imageId}`,
} as const;

export const devLoginBodySchema = z.object({ userId: z.number().int() });

export const addMemberBodySchema = z.object({
  discordUsername: z
    .string()
    .trim()
    .toLowerCase()
    .transform((username) => username.replace(/^@/, ""))
    .pipe(z.string().min(1)),
});
export type AddMemberBody = z.input<typeof addMemberBodySchema>;

export interface ImportStarted {
  importId: string;
}

const VLR_EVENT_URL =
  /^(?:https?:\/\/)?(?:www\.)?vlr\.gg\/event\/(\d+)(\/[^/?#\s]+)?/;

// One canonical spelling per event, because the import cache is keyed by URL.
export const createTournamentBodySchema = z.object({
  vlrEventUrl: z
    .string()
    .trim()
    .regex(VLR_EVENT_URL)
    .transform((url) => {
      const [, eventId, slug = ""] = VLR_EVENT_URL.exec(url) ?? [];
      return `https://www.vlr.gg/event/${eventId}${slug}`;
    }),
});
export type CreateTournamentBody = z.input<typeof createTournamentBodySchema>;

const VLR_PLAYER_URL =
  /^(?:https?:\/\/)?(?:www\.)?vlr\.gg\/player\/(\d+)(\/[^/?#\s]+)?/;

export const addRosterEntryBodySchema = z.object({
  vlrPlayerUrl: z
    .string()
    .trim()
    .regex(VLR_PLAYER_URL)
    .transform((url) => {
      const [, vlrId = "", slug = ""] = VLR_PLAYER_URL.exec(url) ?? [];
      return { vlrId, vlrUrl: `https://www.vlr.gg/player/${vlrId}${slug}` };
    }),
  kind: z.enum(PICKABLE_KINDS),
});
export type AddRosterEntryBody = z.input<typeof addRosterEntryBodySchema>;

export const connectDiscordBodySchema = z.object({
  channelId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/),
});
export type ConnectDiscordBody = z.input<typeof connectDiscordBodySchema>;

export interface DiscordConnectionResult {
  managersWithoutRole: string[];
}

export const updateTournamentBodySchema = z.object({
  joiningOpen: z.boolean().optional(),
  pickSeconds: z
    .number()
    .int()
    .min(MIN_PICK_SECONDS)
    .max(MAX_PICK_SECONDS)
    .optional(),
});
export type UpdateTournamentBody = z.input<typeof updateTournamentBodySchema>;

export const managerColorBodySchema = z.object({
  color: z.enum(MANAGER_COLORS),
});
export type ManagerColorBody = z.input<typeof managerColorBodySchema>;

export const updateStageBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  pickSeconds: z
    .number()
    .int()
    .min(MIN_PICK_SECONDS)
    .max(MAX_PICK_SECONDS)
    .optional(),
});
export type UpdateStageBody = z.input<typeof updateStageBodySchema>;

export const updatePoolEntryBodySchema = z.object({ removed: z.boolean() });
export type UpdatePoolEntryBody = z.input<typeof updatePoolEntryBodySchema>;

const onBehalfOf = z.number().int().optional();

export const draftActionBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pick"),
    pickableId: z.number().int(),
    onBehalfOf,
  }),
  z.object({
    action: z.literal("swap"),
    pickableOutId: z.number().int(),
    pickableInId: z.number().int(),
    onBehalfOf,
  }),
  z.object({ action: z.literal("lock"), onBehalfOf }),
]);
export type DraftActionBody = z.input<typeof draftActionBodySchema>;

// A pick's points in one stage; null until its team has played a map there.
export interface StandingsPick {
  pickable: Pickable;
  teamLogoImageId: number | null;
  points: number | null;
}

export interface ManagerStageStanding {
  stageId: number;
  rank: number;
  locked: boolean;
  points: number | null;
  picks: StandingsPick[];
}

// Ranks are 1-based within each scope. Points are null while the scope has none yet.
export interface ManagerStanding {
  user: User;
  color: ManagerColor;
  rank: number;
  points: number | null;
  // Locked in the latest stage the manager has picks in.
  locked: boolean;
  stages: ManagerStageStanding[];
}

export interface StandingsResponse {
  managers: ManagerStanding[];
}

// One pickable's totals in a scope. Counts include the maps of subs credited to it.
export interface LeaderboardRow {
  pickable: Pickable;
  team: Team;
  // In stage order; Total lists every stage's owner once.
  ownerUserIds: number[];
  maps: number;
  rounds: number;
  // Null until its team has a result in the scope.
  points: number | null;
  bestMatchPoints: number | null;
  // Sweep and forfeit points: the part of PTS no stat column explains.
  bonus: number;
  stats: MapStatLine;
  // VLR's own figures from its event stats page; a credited sub's maps aren't in them.
  rating: number | null;
  acs: number | null;
  kast: number | null;
  adr: number | null;
  subHandles: string[];
  roundsWon: number;
  unplayedBonus: number;
}

export interface LeaderboardScope {
  // Null is the whole tournament.
  stageId: number | null;
  rows: LeaderboardRow[];
}

export interface LeaderboardResponse {
  scoring: ScoringConfig;
  scopes: LeaderboardScope[];
}

export interface MatchHeader {
  id: number;
  stageId: number | null;
  bestOf: number;
  scheduledAt: string | null;
  status: MatchStatus;
  scrapeStatus: ScrapeStatus;
  forfeitWinner: TeamSide | null;
}

export type MatchTeamBase = Team & { score: number | null };

export interface MatchTeamSummary extends MatchTeamBase {
  ownerUserIds: number[];
}

export interface MatchSummary extends MatchHeader {
  needsAttention: boolean;
  mapCount: number;
  team1: MatchTeamSummary | null;
  team2: MatchTeamSummary | null;
}

export interface MatchesResponse {
  syncRunning: boolean;
  matches: MatchSummary[];
}

export interface MatchMap {
  mapNo: number;
  mapName: string;
  team1Rounds: number;
  team2Rounds: number;
}

export interface MatchPick {
  pickable: Pickable;
  ownerUserId: number | null;
  // Null for coaches and for players who sat out every map.
  playerStatTotals: MapStatLine | null;
  points: number;
}

// One row per sub per map. missingPickableIds are the select's options; empty when there's nothing to choose.
export interface MatchSub {
  mapNo: number;
  vlrPlayerId: string;
  handle: string;
  stats: MapStatLine;
  replacesPickableId: number | null;
  needsAssignment: boolean;
  missingPickableIds: number[];
}

export interface MatchTeamDetail extends MatchTeamBase {
  picks: MatchPick[];
  subs: MatchSub[];
}

export interface MatchDetail extends MatchHeader {
  maps: MatchMap[];
  team1: MatchTeamDetail | null;
  team2: MatchTeamDetail | null;
}

export const subAssignmentsBodySchema = z.object({
  assignments: z.array(
    z.object({
      mapNo: z.number().int(),
      subVlrPlayerId: z.string().min(1),
      replacesPickableId: z.number().int().nullable(),
    }),
  ),
});
export type SubAssignmentsBody = z.input<typeof subAssignmentsBodySchema>;
