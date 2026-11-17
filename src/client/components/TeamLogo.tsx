import Box from "@mui/material/Box";
import { API_ROUTES } from "@shared/api";

interface TeamLogoProps {
  imageId: number | null;
  size: number;
}

// Many VLR logos are black on transparent; the glow keeps them visible on the dark background.
const accentGlow = {
  content: '""',
  position: "absolute",
  inset: "-20%",
  borderRadius: "50%",
  background:
    "radial-gradient(closest-side, var(--accent) 55%, transparent 100%)",
  opacity: 0.6,
} as const;

export default function TeamLogo({ imageId, size }: TeamLogoProps) {
  if (imageId === null) {
    return (
      <Box
        aria-hidden
        sx={{
          width: size,
          height: size,
          flex: "none",
          borderRadius: "var(--radius-sm)",
          bgcolor: "var(--pane-hover)",
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        height: size,
        flex: "none",
        "&::before": accentGlow,
      }}
    >
      <Box
        component="img"
        src={API_ROUTES.image(imageId)}
        alt=""
        sx={{
          position: "relative",
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </Box>
  );
}
