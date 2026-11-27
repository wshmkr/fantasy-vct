import { API_ROUTES, type LeaderboardResponse } from "@shared/api";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./apiClient";
import { tournamentQueryKey } from "./tournaments";

// Under the tournament key, so live polling refreshes it with everything else.
export function useLeaderboard(tournamentId: number) {
  return useQuery({
    queryKey: [...tournamentQueryKey(tournamentId), "leaderboard"],
    queryFn: () =>
      apiClient.get<LeaderboardResponse>(
        API_ROUTES.tournamentLeaderboard(tournamentId),
      ),
  });
}
