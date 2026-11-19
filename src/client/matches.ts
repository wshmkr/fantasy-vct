import {
  API_ROUTES,
  type MatchDetail,
  type MatchesResponse,
  type SubAssignmentsBody,
} from "@shared/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiClient } from "./apiClient";
import { TOURNAMENTS_QUERY_KEY, useInvalidateTournaments } from "./tournaments";

const LIVE_REFETCH_MS = 60_000;
const SYNC_POLL_MS = 3_000;

// Nested under the tournament key so tournament invalidations also refresh matches.
const matchesQueryKey = (tournamentId: number) => [
  ...TOURNAMENTS_QUERY_KEY,
  tournamentId,
  "matches",
];

const MAX_WAIT_FOR_NEXT_MATCH_MS = 60 * 60_000;

// Until a match is due, wait for the soonest kickoff so polling starts on its own.
export function liveRefetchInterval(
  data: MatchesResponse | undefined,
  now: number,
): number | false {
  const pending = (data?.matches ?? []).filter(
    (match) => match.scrapeStatus !== "ok",
  );
  if (pending.some((match) => match.status === "live")) return LIVE_REFETCH_MS;
  const kickoffs = pending.flatMap((match) =>
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
  return useQuery({
    queryKey: matchesQueryKey(tournamentId),
    queryFn: () =>
      apiClient.get<MatchesResponse>(
        API_ROUTES.tournamentMatches(tournamentId),
      ),
    refetchInterval: ({ state }) =>
      state.data?.syncRunning
        ? SYNC_POLL_MS
        : liveRefetchInterval(state.data, Date.now()),
  });
}

export function useLiveRefetchInterval(tournamentId: number): number | false {
  return liveRefetchInterval(
    useTournamentMatches(tournamentId).data,
    Date.now(),
  );
}

export function useMatch(tournamentId: number, matchId: number) {
  const refetchInterval = useLiveRefetchInterval(tournamentId);
  return useQuery({
    queryKey: [...matchesQueryKey(tournamentId), matchId],
    queryFn: () => apiClient.get<MatchDetail>(API_ROUTES.match(matchId)),
    refetchInterval,
  });
}

export function useSync(tournamentId: number) {
  const invalidateTournaments = useInvalidateTournaments();
  const running = useTournamentMatches(tournamentId).data?.syncRunning ?? false;
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) invalidateTournaments();
    wasRunning.current = running;
  }, [running, invalidateTournaments]);
  const start = useMutation({
    mutationFn: () => apiClient.post(API_ROUTES.tournamentSync(tournamentId)),
    onSuccess: invalidateTournaments,
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
