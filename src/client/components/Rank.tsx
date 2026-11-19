import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";

export default function Rank({
  rank,
  sx = [],
}: {
  rank: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      variant="stat"
      aria-label="Rank"
      sx={[
        {
          flex: "none",
          textAlign: "center",
          fontWeight: 700,
          color: rank === 1 ? "var(--accent-text)" : "var(--ink-muted)",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {rank}
    </Typography>
  );
}
