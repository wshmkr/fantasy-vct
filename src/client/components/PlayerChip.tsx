import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Pickable } from "@shared/entities";
import { GraduationCap } from "lucide-react";
import PlayerPhoto from "./PlayerPhoto";

interface PlayerChipProps {
  pickable: Pick<Pickable, "kind" | "handle" | "vlrUrl" | "photoImageId">;
  teamLogoImageId: number | null;
}

function CoachBadge() {
  return (
    <Tooltip title="Coach">
      <Box
        component="span"
        role="img"
        aria-label="Coach"
        sx={{
          flex: "none",
          width: 18,
          height: 18,
          borderRadius: "5px",
          bgcolor: "var(--pane-hover)",
          boxShadow: "inset 0 0 0 1px #ffffff26",
          color: "var(--ink)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GraduationCap size={12} aria-hidden />
      </Box>
    </Tooltip>
  );
}

export default function PlayerChip({
  pickable,
  teamLogoImageId,
}: PlayerChipProps) {
  const link = pickable.vlrUrl
    ? {
        component: "a",
        href: pickable.vlrUrl,
        target: "_blank",
        rel: "noopener",
      }
    : { component: "div" };
  return (
    <Box
      {...link}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        p: "6px",
        minWidth: 0,
        borderRadius: "9px",
        color: "var(--ink)",
        textDecoration: "none",
        transition: "background-color 150ms ease-out",
        "&:is(a):hover": { bgcolor: "var(--pane-hover)" },
      }}
    >
      <PlayerPhoto
        photoImageId={pickable.photoImageId}
        teamLogoImageId={teamLogoImageId}
        size={30}
      />
      <Typography
        variant="bodyStrong"
        noWrap
        title={pickable.handle}
        sx={{ minWidth: 0 }}
      >
        {pickable.handle}
      </Typography>
      {pickable.kind === "coach" && <CoachBadge />}
    </Box>
  );
}
