import Box from "@mui/material/Box";
import { API_ROUTES } from "@shared/api";
import TeamLogo from "./TeamLogo";

interface PlayerPhotoProps {
  photoImageId: number;
  teamLogoImageId: number | null;
  size: 26 | 28 | 30;
}

export default function PlayerPhoto({
  photoImageId,
  teamLogoImageId,
  size,
}: PlayerPhotoProps) {
  const badgeSize = Math.round(size * 0.44);
  return (
    <Box sx={{ position: "relative", width: size, height: size, flex: "none" }}>
      <Box
        component="img"
        src={API_ROUTES.image(photoImageId)}
        alt=""
        sx={{
          display: "block",
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          bgcolor: "#1f1f24",
          boxShadow: "inset 0 0 0 1px var(--pane-edge)",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          right: -3,
          bottom: -3,
          width: badgeSize,
          height: badgeSize,
          borderRadius: "50%",
          bgcolor: "var(--bg)",
          boxShadow: "0 0 0 1px var(--pane-edge)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TeamLogo imageId={teamLogoImageId} size={badgeSize - 3} />
      </Box>
    </Box>
  );
}
