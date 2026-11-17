import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Pickable } from "@shared/entities";
import { GraduationCap } from "lucide-react";
import PlayerPhoto from "./PlayerPhoto";

interface PlayerChipProps {
  pickable: Pick<Pickable, "kind" | "handle" | "vlrUrl" | "photoImageId">;
  teamLogoImageId: number | null;
  dense?: boolean;
  struckOut?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
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

function chipElement(vlrUrl: string | null, onClick: (() => void) | undefined) {
  if (onClick) return { component: "button", type: "button", onClick };
  if (vlrUrl) {
    return { component: "a", href: vlrUrl, target: "_blank", rel: "noopener" };
  }
  return { component: "div" };
}

export default function PlayerChip({
  pickable,
  teamLogoImageId,
  dense = false,
  struckOut = false,
  onClick,
  ...ariaProps
}: PlayerChipProps) {
  return (
    <Box
      {...chipElement(pickable.vlrUrl, onClick)}
      {...ariaProps}
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: dense ? "7px" : "9px",
          p: dense ? "2px 4px" : "6px",
          minWidth: 0,
          border: 0,
          borderRadius: dense ? "var(--radius-sm)" : "9px",
          bgcolor: "transparent",
          color: "var(--ink)",
          font: "inherit",
          textAlign: "left",
          textDecoration: "none",
          cursor: onClick ? "pointer" : undefined,
          transition: "background-color 150ms ease-out, opacity 150ms ease-out",
          "&:is(a, button):hover": { bgcolor: "var(--pane-hover)" },
        },
        struckOut && { opacity: 0.35 },
      ]}
    >
      <PlayerPhoto
        photoImageId={pickable.photoImageId}
        teamLogoImageId={teamLogoImageId}
        size={dense ? 26 : 30}
      />
      <Typography
        variant="bodyStrong"
        noWrap
        title={pickable.handle}
        sx={[
          { minWidth: 0 },
          dense && { fontSize: 13 },
          struckOut && { textDecoration: "line-through" },
        ]}
      >
        {pickable.handle}
      </Typography>
      {pickable.kind === "coach" && <CoachBadge />}
    </Box>
  );
}
