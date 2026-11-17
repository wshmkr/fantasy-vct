import Box from "@mui/material/Box";
import { API_ROUTES } from "@shared/api";

interface EventLogoProps {
  imageId: number | null;
  size: number;
}

export default function EventLogo({ imageId, size }: EventLogoProps) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: `${Math.round(size * 0.27)}px`,
        bgcolor: "#ffffff14",
        border: "1px solid #ffffff2e",
        boxShadow: "inset 0 1px 0 #ffffff33, 0 10px 30px #00000066",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {imageId !== null && (
        <Box
          component="img"
          src={API_ROUTES.image(imageId)}
          alt=""
          sx={{ width: "72%", height: "72%", objectFit: "contain" }}
        />
      )}
    </Box>
  );
}
