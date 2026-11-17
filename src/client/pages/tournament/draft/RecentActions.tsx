import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  type DraftAction,
  type DraftActionKind,
  type DraftSeat,
  displayNameOf,
  type PoolPickable,
} from "@shared/entities";
import { ArrowLeftRight, Clock, Lock } from "lucide-react";
import type { ReactNode } from "react";
import ManagerAvatar from "../../../components/ManagerAvatar";
import Pane from "../../../components/Pane";

const ACTION_ICONS: Record<DraftActionKind, ReactNode> = {
  pick: (
    <Box
      sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "currentColor" }}
    />
  ),
  swap: <ArrowLeftRight size={12} strokeWidth={2.4} />,
  lock: <Lock size={11} strokeWidth={2.6} />,
};
const ACTION_COLORS: Record<DraftActionKind, string> = {
  pick: "var(--ink-muted)",
  swap: "var(--accent)",
  lock: "var(--ink)",
};

export default function RecentActions({
  actions,
  seats,
  pickablesById,
}: {
  actions: DraftAction[];
  seats: DraftSeat[];
  pickablesById: ReadonlyMap<number, PoolPickable>;
}) {
  const seatsByUser = new Map(seats.map((seat) => [seat.user.id, seat]));
  return (
    <Pane
      component="section"
      aria-label="Recent"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "20px",
        minHeight: 46,
        py: "12px",
        overflow: "hidden",
      }}
    >
      {actions.map((action) => {
        const seat = seatsByUser.get(action.userId);
        const handle =
          action.pickableInId === null
            ? null
            : pickablesById.get(action.pickableInId)?.handle;
        return (
          <Box
            key={action.id}
            aria-label={action.action}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              flex: "none",
            }}
          >
            {seat && (
              <Tooltip title={displayNameOf(seat.user)}>
                <Box sx={{ display: "flex" }}>
                  <ManagerAvatar
                    user={seat.user}
                    size={20}
                    ringColor={seat.color}
                  />
                </Box>
              </Tooltip>
            )}
            <Box
              aria-hidden
              sx={{ display: "flex", color: ACTION_COLORS[action.action] }}
            >
              {ACTION_ICONS[action.action]}
            </Box>
            {handle && (
              <Typography variant="bodyStrong" sx={{ fontSize: 12 }}>
                {handle}
              </Typography>
            )}
            {action.auto && (
              <Tooltip title="Timed out">
                <Box sx={{ display: "flex", color: "var(--ink-muted)" }}>
                  <Clock size={11} strokeWidth={2.4} aria-label="Timed out" />
                </Box>
              </Tooltip>
            )}
          </Box>
        );
      })}
    </Pane>
  );
}
