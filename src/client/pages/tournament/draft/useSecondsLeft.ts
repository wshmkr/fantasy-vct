import type { DraftState } from "@shared/entities";
import { useEffect, useState } from "react";
import { secondsLeft } from "./draftView";

const TICK_MS = 250;
export const FINAL_SECONDS = 10;

export function useSecondsLeft(
  draft: Pick<DraftState, "turnDeadline" | "serverNow">,
  receivedAt: number,
): number | null {
  const [now, setNow] = useState(Date.now);
  const ticking = draft.turnDeadline !== null;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);
  if (draft.turnDeadline === null) return null;
  // `now` can predate a refetch that landed between two ticks.
  const sampledAt = Math.max(now, receivedAt);
  return secondsLeft(
    draft.turnDeadline,
    draft.serverNow,
    receivedAt,
    sampledAt,
  );
}
