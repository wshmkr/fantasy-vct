import Chip, { type ChipProps } from "@mui/material/Chip";
import type { TournamentStatus } from "@shared/entities";

const STATUS_LABELS: Record<TournamentStatus, string> = {
  upcoming: "Upcoming",
  drafting: "Drafting",
  live: "Live",
  ended: "Ended",
};

export default function StatusBadge({
  status,
  size = "medium",
}: {
  status: TournamentStatus;
  size?: ChipProps["size"];
}) {
  const isActive = status === "live" || status === "drafting";
  return (
    <Chip
      component="span"
      label={STATUS_LABELS[status]}
      size={size}
      sx={[
        {
          bgcolor: "var(--neutral-badge)",
          color: "var(--ink)",
          "&.MuiChip-sizeMedium": {
            height: 22,
            "& .MuiChip-label": { px: "10px" },
          },
        },
        isActive && {
          bgcolor: "var(--accent)",
          color: "var(--on-accent)",
          boxShadow:
            "0 4px 14px color-mix(in srgb, var(--accent) 33%, transparent)",
        },
      ]}
    />
  );
}
