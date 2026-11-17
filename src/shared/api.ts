import { z } from "zod";
import {
  type DraftControl,
  MANAGER_COLORS,
  MAX_PICK_SECONDS,
  MIN_PICK_SECONDS,
} from "./entities.js";

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
