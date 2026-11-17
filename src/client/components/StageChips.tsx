import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import type { Stage } from "@shared/entities";

export default function StageChips({ stages }: { stages: Stage[] }) {
  return (
    <Box sx={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {stages.map((stage) => {
        const isCurrent =
          stage.status === "drafting" || stage.status === "paused";
        return (
          <Chip
            key={stage.id}
            component="span"
            label={stage.name}
            sx={[
              {
                height: 22,
                fontWeight: 500,
                bgcolor: "var(--pane)",
                color: "var(--ink-muted)",
                boxShadow: "inset 0 0 0 1px #ffffff14",
                "& .MuiChip-label": { px: "10px" },
              },
              isCurrent && {
                bgcolor: "var(--accent-soft)",
                color: "var(--accent-text)",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, var(--accent) 33%, transparent)",
              },
              stage.status === "complete" && {
                opacity: 0.6,
                boxShadow: "none",
              },
            ]}
          />
        );
      })}
    </Box>
  );
}
