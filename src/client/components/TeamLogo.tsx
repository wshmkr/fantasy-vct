import Box from "@mui/material/Box";
import { API_ROUTES } from "@shared/api";

interface TeamLogoProps {
  imageId: number | null;
  size: number;
}

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
      component="img"
      src={API_ROUTES.image(imageId)}
      alt=""
      sx={{ width: size, height: size, flex: "none", objectFit: "contain" }}
    />
  );
}
