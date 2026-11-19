import Chip from "@mui/material/Chip";
import type { TournamentStatus } from "@shared/entities";

const STATUS_LABELS: Record<TournamentStatus, string> = {
  upcoming: "Upcoming",
  drafting: "Drafting",
  live: "Live",
  ended: "Ended",
};

export default function StatusBadge({
  status,
  compact = false,
}: {
  status: TournamentStatus;
  compact?: boolean;
}) {
  const isActive = status === "live" || status === "drafting";
  return (
    <Chip
      component="span"
      label={STATUS_LABELS[status]}
      sx={[
        {
          height: 22,
          bgcolor: "var(--neutral-badge)",
          color: "var(--ink)",
          "& .MuiChip-label": { px: "10px" },
        },
        isActive && {
          bgcolor: "var(--accent)",
          color: "var(--on-accent)",
          boxShadow:
            "0 4px 14px color-mix(in srgb, var(--accent) 33%, transparent)",
        },
        compact && {
          height: 18,
          fontSize: 11,
          "& .MuiChip-label": { px: "7px" },
        },
      ]}
    />
  );
}
