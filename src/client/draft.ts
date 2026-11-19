import { API_ROUTES, type DraftActionBody } from "@shared/api";
import type { DraftControl, DraftState } from "@shared/entities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "./apiClient";
import { tournamentQueryKey } from "./tournaments";

const draftQueryKey = (stageId: number) => ["draft", stageId];

export function useDraft(stageId: number) {
  return useQuery({
    queryKey: draftQueryKey(stageId),
    queryFn: () => apiClient.get<DraftState>(API_ROUTES.draft(stageId)),
  });
}

// Draft changes move standings, pools and stage status, so the whole tournament refreshes.
export function useDraftStream(
  tournamentId: number,
  stageId: number | undefined,
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (stageId === undefined) return;
    const refetch = () => {
      queryClient.invalidateQueries({ queryKey: draftQueryKey(stageId) });
      queryClient.invalidateQueries({
        queryKey: tournamentQueryKey(tournamentId),
      });
    };
    const stream = new EventSource(API_ROUTES.draftStream(stageId));
    stream.addEventListener("changed", refetch);
    let hasOpened = false;
    // Events sent while the stream was reconnecting are lost, so catch up on every reopen.
    stream.addEventListener("open", () => {
      if (hasOpened) refetch();
      hasOpened = true;
    });
    return () => stream.close();
  }, [tournamentId, stageId, queryClient]);
}

export type DraftCommand =
  | { action: DraftActionBody }
  | { control: DraftControl };

export function useDraftCommand(stageId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: DraftCommand) =>
      "action" in command
        ? apiClient.post(API_ROUTES.draftActions(stageId), command.action)
        : apiClient.post(API_ROUTES.draftControl(stageId, command.control)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: draftQueryKey(stageId) }),
  });
}
