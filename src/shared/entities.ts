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

export const STAGE_SOURCES = ["vlr", "manual"] as const;
export type StageSource = (typeof STAGE_SOURCES)[number];

export const MATCH_STATUSES = ["upcoming", "live", "completed"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

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

export interface RosterEntry {
  userId: number;
  pickableId: number;
}

export interface DraftSeat {
  seat: number;
  user: User;
  color: ManagerColor;
  locked: boolean;
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

export interface PoolPickable extends Pickable {
  ownerUserId: number | null;
}

export interface DraftState {
  stageId: number;
  status: StageStatus;
  phase: DraftPhase;
  round: number;
  seats: DraftSeat[];
  rosters: RosterEntry[];
  pool: PoolPickable[];
  teams: Team[];
  currentSeat: number | null;
  turnDeadline: string | null;
  serverNow: string;
  recentActions: DraftAction[];
}
