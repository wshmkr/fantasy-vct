import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  type DraftSeat,
  type DraftState,
  type DroppedPickable,
  displayNameOf,
  isDraftRunning,
  type Pickable,
  type PoolPickable,
  ROSTER_LIMITS,
} from "@shared/entities";
import { GraduationCap, Lock } from "lucide-react";
import { useState } from "react";
import ManagerAvatar from "../../../components/ManagerAvatar";
import Pane from "../../../components/Pane";
import PlayerPhoto from "../../../components/PlayerPhoto";
import { GlowingAvatar } from "./ClockBar";
import { PLAYER_SLOTS, seatRoster, splitRoster } from "./draftView";
import { flipIn, riseIn } from "./motion";
import { useSecondsLeft } from "./useSecondsLeft";

const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: `34px repeat(${ROSTER_LIMITS.player + ROSTER_LIMITS.coach}, minmax(0, 1fr))`,
  gap: "8px",
  alignItems: "center",
  px: "8px",
};
const COACH_GAP = "6px";

type CellHighlight = "next" | "selected" | null;

function useEntrance(pickableId: number | null) {
  const [shown, setShown] = useState({
    pickableId,
    entrance: null as string | null,
  });
  if (shown.pickableId !== pickableId) {
    const entrance =
      pickableId === null ? null : shown.pickableId === null ? riseIn : flipIn;
    setShown({ pickableId, entrance });
  }
  return shown.entrance;
}

interface CellPick {
  pickable: Pickable;
  teamLogoImageId: number | null;
  // Eliminated in the previous stage; the carry-over drops it when this draft starts.
  isDropped: boolean;
}

function BoardCell({
  pick,
  seat,
  highlight,
  isCoachSlot,
  onSelect,
}: {
  pick: CellPick | undefined;
  seat: DraftSeat;
  highlight: CellHighlight;
  isCoachSlot: boolean;
  onSelect: (() => void) | undefined;
}) {
  const pickable = pick?.pickable;
  const entrance = useEntrance(pickable?.id ?? null);
  const color = `var(--${seat.color})`;
  return (
    <Box
      component={onSelect ? ButtonBase : "div"}
      onClick={onSelect}
      aria-pressed={onSelect ? highlight === "selected" : undefined}
      aria-label={
        pick?.isDropped ? `${pickable?.handle} dropped` : pickable?.handle
      }
      title={pickable?.handle}
      sx={[
        {
          height: 40,
          minWidth: 0,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          justifyContent: "flex-start",
          px: "8px",
          borderRadius: "var(--radius-sm)",
          color: "var(--ink)",
          bgcolor: "#ffffff03",
          boxShadow: "inset 0 0 0 1px var(--pane-edge)",
          perspective: 300,
          transition: "box-shadow 150ms ease-out, background-color 150ms",
        },
        isCoachSlot && { ml: COACH_GAP },
        pick?.isDropped === false && {
          bgcolor: `color-mix(in srgb, ${color} 16%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`,
        },
        highlight === "next" && {
          bgcolor: "var(--accent-soft)",
          boxShadow: "var(--shadow-glow)",
        },
        highlight === "selected" && {
          boxShadow:
            "inset 0 0 0 2px var(--accent), 0 0 14px color-mix(in srgb, var(--accent) 45%, transparent)",
        },
        onSelect !== undefined && {
          cursor: "pointer",
          "&:hover": {
            boxShadow: `inset 0 0 0 1px var(--accent)`,
          },
        },
      ]}
    >
      {pickable && (
        <Box
          key={pickable.id}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
            animation: entrance ?? undefined,
            opacity: pick?.isDropped ? 0.4 : undefined,
          }}
        >
          <PlayerPhoto
            photoImageId={pickable.photoImageId}
            teamLogoImageId={pick?.teamLogoImageId ?? null}
            size={26}
          />
          <Typography
            variant="bodyStrong"
            noWrap
            sx={{
              minWidth: 0,
              fontSize: 13,
              textDecoration: pick?.isDropped ? "line-through" : undefined,
            }}
          >
            {pickable.handle}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function SeatAvatar({
  seat,
  draft,
  receivedAt,
  isOnClock,
}: {
  seat: DraftSeat;
  draft: DraftState;
  receivedAt: number;
  isOnClock: boolean;
}) {
  return (
    <Tooltip title={displayNameOf(seat.user)}>
      <Box sx={{ position: "relative", width: 30, height: 30, mx: "2px" }}>
        {isOnClock ? (
          <OnClockAvatar seat={seat} draft={draft} receivedAt={receivedAt} />
        ) : (
          <ManagerAvatar user={seat.user} size={30} ringColor={seat.color} />
        )}
        {seat.locked && (
          <Box
            role="img"
            aria-label="Locked"
            sx={{
              position: "absolute",
              right: -5,
              bottom: -5,
              width: 15,
              height: 15,
              borderRadius: "50%",
              bgcolor: "var(--bg)",
              boxShadow: "0 0 0 1px #ffffff2e",
              color: "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Lock size={9} strokeWidth={3} aria-hidden />
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

function OnClockAvatar({
  seat,
  draft,
  receivedAt,
}: {
  seat: DraftSeat;
  draft: DraftState;
  receivedAt: number;
}) {
  const secondsLeft = useSecondsLeft(draft, receivedAt);
  return <GlowingAvatar seat={seat} size={30} secondsLeft={secondsLeft} />;
}

interface DraftBoardProps {
  draft: DraftState;
  receivedAt: number;
  pickablesById: ReadonlyMap<number, PoolPickable>;
  teamLogos: ReadonlyMap<number, number | null>;
  swapperUserId: number | null;
  swapOutId: number | null;
  onSwapOutSelect: (pickable: Pickable) => void;
}

export default function DraftBoard({
  draft,
  receivedAt,
  pickablesById,
  teamLogos,
  swapperUserId,
  swapOutId,
  onSwapOutSelect,
}: DraftBoardProps) {
  return (
    <Pane
      component="section"
      aria-label="Draft board"
      sx={{ display: "flex", flexDirection: "column", gap: "8px" }}
    >
      <Box
        aria-hidden
        sx={{ ...ROW_GRID, color: "var(--ink-muted)", pb: "2px" }}
      >
        <span />
        {PLAYER_SLOTS.map((slot) => (
          <Typography key={slot} variant="label" sx={{ textAlign: "center" }}>
            {slot + 1}
          </Typography>
        ))}
        <Box sx={{ display: "flex", justifyContent: "center", ml: COACH_GAP }}>
          <GraduationCap size={13} />
        </Box>
      </Box>
      {draft.seats.map((seat) => {
        const { players, coach } = seatRoster(seat, pickablesById);
        const dropped = splitRoster(seat.droppedPickables, (p) => p.kind);
        const kept = (pickable: PoolPickable): CellPick => ({
          pickable,
          teamLogoImageId: teamLogos.get(pickable.teamId) ?? null,
          isDropped: false,
        });
        const droppedPick = (pickable: DroppedPickable): CellPick => ({
          pickable,
          teamLogoImageId: pickable.teamLogoImageId,
          isDropped: true,
        });
        const playerPicks = [
          ...players.map(kept),
          ...dropped.players.map(droppedPick),
        ];
        const coachPick = coach
          ? kept(coach)
          : dropped.coach && droppedPick(dropped.coach);
        const isOnClock =
          isDraftRunning(draft.status) && seat.seat === draft.currentSeat;
        const nextSlot = isOnClock
          ? Math.min(players.length, ROSTER_LIMITS.player)
          : null;
        const canSwapOut = seat.user.id === swapperUserId;
        const cell = (pick: CellPick | undefined, slot: number) => (
          <BoardCell
            key={slot}
            pick={pick}
            seat={seat}
            isCoachSlot={slot === ROSTER_LIMITS.player}
            highlight={
              pick && pick.pickable.id === swapOutId
                ? "selected"
                : !pick && slot === nextSlot
                  ? "next"
                  : null
            }
            onSelect={
              canSwapOut && pick && !pick.isDropped
                ? () => onSwapOutSelect(pick.pickable)
                : undefined
            }
          />
        );
        return (
          <Box
            key={seat.user.id}
            role="group"
            aria-label={displayNameOf(seat.user)}
            sx={[
              {
                ...ROW_GRID,
                py: "5px",
                borderRadius: "12px",
                transition: "opacity 200ms ease-out, background-color 200ms",
              },
              isOnClock && {
                bgcolor: "color-mix(in srgb, var(--accent) 8%, transparent)",
              },
              seat.locked && draft.status !== "complete" && { opacity: 0.5 },
            ]}
          >
            <SeatAvatar
              seat={seat}
              draft={draft}
              receivedAt={receivedAt}
              isOnClock={isOnClock}
            />
            {PLAYER_SLOTS.map((slot) => cell(playerPicks[slot], slot))}
            {cell(coachPick, ROSTER_LIMITS.player)}
          </Box>
        );
      })}
    </Pane>
  );
}
