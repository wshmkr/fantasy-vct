import { z } from "zod";

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
