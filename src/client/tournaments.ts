import { API_ROUTES, type ManagerColorBody } from "@shared/api";
import type {
  ImportJob,
  ManagerColor,
  StagePoolTeam,
  TeamWithPickables,
  Tournament,
} from "@shared/entities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { apiClient } from "./apiClient";

export const TOURNAMENTS_QUERY_KEY = ["tournaments"];
const tournamentQueryKey = (tournamentId: number) => [
  ...TOURNAMENTS_QUERY_KEY,
  tournamentId,
];

export function useTournaments() {
  return useQuery({
    queryKey: TOURNAMENTS_QUERY_KEY,
    queryFn: () => apiClient.get<Tournament[]>(API_ROUTES.tournaments),
  });
}

export function useTournament(
  tournamentId: number,
  refetchInterval: number | false = false,
) {
  return useQuery({
    queryKey: tournamentQueryKey(tournamentId),
    queryFn: () =>
      apiClient.get<Tournament>(API_ROUTES.tournament(tournamentId)),
    refetchInterval,
  });
}

export function useTournamentTeams(tournamentId: number) {
  return useQuery({
    queryKey: [...tournamentQueryKey(tournamentId), "teams"],
    queryFn: () =>
      apiClient.get<TeamWithPickables[]>(
        API_ROUTES.tournamentTeams(tournamentId),
      ),
  });
}

// Nested under the tournament key so every tournament mutation also refreshes the pool.
export function useStagePool(tournamentId: number, stageId: number) {
  return useQuery({
    queryKey: [...tournamentQueryKey(tournamentId), "pool", stageId],
    queryFn: () =>
      apiClient.get<StagePoolTeam[]>(API_ROUTES.stagePool(stageId)),
  });
}

export function useImportJob(importId: string | null) {
  const invalidateTournaments = useInvalidateTournaments();
  const query = useQuery({
    queryKey: ["imports", importId],
    queryFn: () =>
      apiClient.get<ImportJob>(API_ROUTES.importJob(importId ?? "")),
    enabled: importId !== null,
    refetchInterval: ({ state }) =>
      state.status === "error" || state.data?.tournamentId || state.data?.error
        ? false
        : 1000,
  });
  // Jobs live in server memory, so a restart mid-import loses the job.
  const failure = query.data?.error ?? (query.isError ? "Import lost" : null);
  const importedTournamentId = query.data?.tournamentId;
  useEffect(() => {
    if (importedTournamentId) invalidateTournaments();
  }, [importedTournamentId, invalidateTournaments]);
  return { job: query.data, failure };
}

export function useInvalidateTournaments() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: TOURNAMENTS_QUERY_KEY }),
    [queryClient],
  );
}

export function useTournamentMutation<Variables>(
  mutationFn: (variables: Variables) => Promise<unknown>,
) {
  const invalidateTournaments = useInvalidateTournaments();
  return useMutation({ mutationFn, onSuccess: invalidateTournaments });
}

export function useJoinTournament(tournamentId: number) {
  return useTournamentMutation((color: ManagerColor) =>
    apiClient.post(API_ROUTES.tournamentMembers(tournamentId), {
      color,
    } satisfies ManagerColorBody),
  );
}

export function useChangeMyColor(tournamentId: number) {
  return useTournamentMutation((color: ManagerColor) =>
    apiClient.patch(API_ROUTES.myTournamentMembership(tournamentId), {
      color,
    } satisfies ManagerColorBody),
  );
}
