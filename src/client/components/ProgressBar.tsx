import Box from "@mui/material/Box";

interface ProgressBarProps {
  done: number;
  total: number;
  height?: number;
  muted?: boolean;
}

export default function ProgressBar({
  done,
  total,
  height = 4,
  muted = false,
}: ProgressBarProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <Box
      role="progressbar"
      aria-valuenow={percent}
      sx={{
        width: "100%",
        height,
        borderRadius: `${height}px`,
        bgcolor: "#ffffff14",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: `${percent}%`,
          height: "100%",
          borderRadius: "inherit",
          bgcolor: muted ? "var(--line)" : "var(--accent)",
          transition: "width 300ms ease-out",
        }}
      />
    </Box>
  );
}
