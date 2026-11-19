import {
  API_ROUTES,
  type MatchDetail,
  type MatchesResponse,
  type SubAssignmentsBody,
} from "@shared/api";
import { hasStarted } from "@shared/entities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiClient } from "./apiClient";
import { tournamentQueryKey, useInvalidateTournaments } from "./tournaments";

const LIVE_REFETCH_MS = 60_000;
const SYNC_POLL_MS = 3_000;
const MAX_WAIT_FOR_NEXT_MATCH_MS = 60 * 60_000;

// Nested under the tournament key so tournament invalidations also refresh matches.
const matchesQueryKey = (tournamentId: number) => [
  ...tournamentQueryKey(tournamentId),
  "matches",
];

const matchesQueryOptions = (tournamentId: number) => ({
  queryKey: matchesQueryKey(tournamentId),
  queryFn: () =>
    apiClient.get<MatchesResponse>(API_ROUTES.tournamentMatches(tournamentId)),
});

// Until a match is due, wait for the soonest kickoff so polling starts on its own.
export function liveRefetchInterval(
  data: MatchesResponse | undefined,
  now: number,
): number | false {
  const unscraped = (data?.matches ?? []).filter(
    (match) => match.scrapeStatus !== "ok",
  );
  if (unscraped.some((match) => hasStarted(match, new Date(now)))) {
    return LIVE_REFETCH_MS;
  }
  const kickoffs = unscraped.flatMap((match) =>
    match.scheduledAt === null ? [] : [Date.parse(match.scheduledAt)],
  );
  if (kickoffs.length === 0) return false;
  const untilSoonest = Math.min(...kickoffs) - now;
  return Math.min(
    Math.max(untilSoonest, LIVE_REFETCH_MS),
    MAX_WAIT_FOR_NEXT_MATCH_MS,
  );
}

export function useTournamentMatches(tournamentId: number) {
  return useQuery(matchesQueryOptions(tournamentId));
}

// Structural sharing keeps the same reference when nothing changed, so only real changes cascade.
export function useLivePolling(tournamentId: number) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    ...matchesQueryOptions(tournamentId),
    refetchInterval: ({ state }) =>
      state.data?.syncRunning
        ? SYNC_POLL_MS
        : liveRefetchInterval(state.data, Date.now()),
  });
  const previousData = useRef(data);
  useEffect(() => {
    if (previousData.current && data !== previousData.current) {
      queryClient.invalidateQueries({
        queryKey: tournamentQueryKey(tournamentId),
      });
    }
    previousData.current = data;
  }, [data, queryClient, tournamentId]);
}

export function useMatch(tournamentId: number, matchId: number) {
  return useQuery({
    queryKey: [...matchesQueryKey(tournamentId), matchId],
    queryFn: () => apiClient.get<MatchDetail>(API_ROUTES.match(matchId)),
  });
}

export function useSync(tournamentId: number) {
  const queryClient = useQueryClient();
  const running = useTournamentMatches(tournamentId).data?.syncRunning ?? false;
  const start = useMutation({
    mutationFn: () => apiClient.post(API_ROUTES.tournamentSync(tournamentId)),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: matchesQueryKey(tournamentId),
        exact: true,
      }),
  });
  return { running: running || start.isPending, start: () => start.mutate() };
}

export function useAssignSub(matchId: number) {
  const invalidateTournaments = useInvalidateTournaments();
  return useMutation({
    mutationFn: (assignment: SubAssignmentsBody["assignments"][number]) =>
      apiClient.put(API_ROUTES.matchSubs(matchId), {
        assignments: [assignment],
      } satisfies SubAssignmentsBody),
    onSuccess: invalidateTournaments,
  });
}
