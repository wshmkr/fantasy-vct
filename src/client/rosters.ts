import { type AddRosterEntryBody, API_ROUTES } from "@shared/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./apiClient";
import { DRAFT_QUERY_KEY } from "./draft";
import { TOURNAMENTS_QUERY_KEY } from "./tournaments";

// Rosters feed the Teams tab and every setup stage's pool, so both caches refresh.
function useRosterMutation<Variables>(
  mutationFn: (variables: Variables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: TOURNAMENTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: DRAFT_QUERY_KEY }),
      ]),
  });
}

export function useAddToRoster(teamId: number) {
  return useRosterMutation((body: AddRosterEntryBody) =>
    apiClient.post(API_ROUTES.teamRoster(teamId), body),
  );
}

export function useRemoveFromRoster(teamId: number) {
  return useRosterMutation((pickableId: number) =>
    apiClient.delete(API_ROUTES.teamRosterEntry(teamId, pickableId)),
  );
}
