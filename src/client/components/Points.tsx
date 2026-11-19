import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";

function formatPoints(points: number | null): string {
  if (points === null) return "–";
  const magnitude = Math.abs(points).toLocaleString("en-US");
  return points < 0 ? `−${magnitude}` : magnitude;
}

export default function Points({
  points,
  sx = [],
}: {
  points: number | null;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      variant="stat"
      sx={[
        { flex: "none", textAlign: "right", fontWeight: 600 },
        ...(Array.isArray(sx) ? sx : [sx]),
        points !== null && points < 0 && { color: "var(--loss)" },
      ]}
    >
      {formatPoints(points)}
    </Typography>
  );
}
