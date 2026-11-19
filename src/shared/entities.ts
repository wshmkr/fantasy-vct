export const MANAGER_COLORS = [
  "manager-red",
  "manager-amber",
  "manager-olive",
  "manager-green",
  "manager-teal",
  "manager-blue",
  "manager-violet",
  "manager-rose",
  "manager-red-deep",
  "manager-amber-deep",
  "manager-olive-deep",
  "manager-green-deep",
  "manager-teal-deep",
  "manager-blue-deep",
  "manager-violet-deep",
  "manager-rose-deep",
] as const;
export type ManagerColor = (typeof MANAGER_COLORS)[number];

export const MAX_MANAGERS = 8;
export const MIN_PICK_SECONDS = 15;
export const MAX_PICK_SECONDS = 600;

export const USER_ROLES = ["commissioner", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PICKABLE_KINDS = ["player", "coach"] as const;
export type PickableKind = (typeof PICKABLE_KINDS)[number];

export const STAGE_STATUSES = [
  "setup",
  "drafting",
  "paused",
  "complete",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export function isDraftRunning(status: StageStatus): boolean {
  return status === "drafting" || status === "paused";
}

export const STAGE_SOURCES = ["vlr", "manual"] as const;
export type StageSource = (typeof STAGE_SOURCES)[number];

export const STAGE_FORMATS = ["standard", "swiss"] as const;
export type StageFormat = (typeof STAGE_FORMATS)[number];

export const MATCH_STATUSES = ["upcoming", "live", "completed"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const SCRAPE_STATUSES = ["pending", "ok", "failed"] as const;
export type ScrapeStatus = (typeof SCRAPE_STATUSES)[number];

export const DRAFT_ACTION_KINDS = ["pick", "swap", "lock"] as const;
export type DraftActionKind = (typeof DRAFT_ACTION_KINDS)[number];

export type TournamentStatus = "upcoming" | "drafting" | "live" | "ended";
export type DraftPhase = "draft" | "swap";

export interface User {
  id: number;
  role: UserRole;
  discordUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
  firstLoginAt: string | null;
}

export function displayNameOf(
  user: Pick<User, "displayName" | "discordUsername">,
): string {
  return user.displayName ?? user.discordUsername;
}

export interface Team {
  id: number;
  name: string;
  logoImageId: number | null;
}

export interface TeamWithPickables extends Team {
  pickables: ScoredPickable[];
}

export interface TopAgent {
  name: string;
  imageId: number;
}

export interface Pickable {
  id: number;
  kind: PickableKind;
  handle: string;
  teamId: number;
  isPlaceholder: boolean;
  vlrUrl: string | null;
  photoImageId: number;
  topAgents: TopAgent[];
  formRating: number | null;
  formAcs: number | null;
  formKd: number | null;
  formRounds: number | null;
}

// Tournament points, Swiss phantom series included; null until the pick's team has played.
export interface ScoredPickable extends Pickable {
  points: number | null;
}

export interface TournamentMember {
  user: User;
  color: ManagerColor;
}

export interface Stage {
  id: number;
  tournamentId: number;
  name: string;
  position: number;
  status: StageStatus;
  pickSeconds: number;
  matchCount: number;
  poolSize: number;
}

export interface StagePoolEntry extends Pickable {
  removed: boolean;
}

export interface StagePoolTeam extends Team {
  pool: StagePoolEntry[];
}

export interface Tournament {
  id: number;
  name: string;
  vlrEventUrl: string;
  logoImageId: number | null;
  joiningOpen: boolean;
  status: TournamentStatus;
  stages: Stage[];
  members: TournamentMember[];
  teamCount: number;
  matchesPlayed: number;
  matchesTotal: number;
}

export const ROSTER_LIMITS: Record<PickableKind, number> = {
  player: 5,
  coach: 1,
};

export interface DraftSeat {
  seat: number;
  user: User;
  color: ManagerColor;
  locked: boolean;
  rosterPickableIds: number[];
}

export interface DraftAction {
  id: number;
  userId: number;
  action: DraftActionKind;
  pickableInId: number | null;
  pickableOutId: number | null;
  auto: boolean;
  createdAt: string;
}

export interface PoolPickable extends ScoredPickable {
  ownerUserId: number | null;
}

export interface DraftState {
  stageId: number;
  status: StageStatus;
  phase: DraftPhase;
  round: number;
  turnNo: number;
  pickSeconds: number;
  seats: DraftSeat[];
  pool: PoolPickable[];
  teams: Team[];
  currentSeat: number | null;
  turnDeadline: string | null;
  serverNow: string;
  recentActions: DraftAction[];
}

export const DRAFT_CONTROLS = [
  "shuffle",
  "start",
  "pause",
  "resume",
  "undo",
] as const;
export type DraftControl = (typeof DRAFT_CONTROLS)[number];

export const IMPORT_PHASES = ["event", "teams", "players"] as const;
export type ImportPhase = (typeof IMPORT_PHASES)[number];

export interface ImportProgress {
  phase: ImportPhase;
  done: number;
  total: number;
}

export interface ImportJob {
  progress: Partial<Record<ImportPhase, { done: number; total: number }>>;
  tournamentId: number | null;
  error: string | null;
}
