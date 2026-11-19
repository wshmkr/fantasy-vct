import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Pickable } from "@shared/entities";
import { GraduationCap } from "lucide-react";
import PlayerPhoto from "./PlayerPhoto";
import Points from "./Points";

interface PlayerChipProps {
  pickable: Pick<Pickable, "kind" | "handle" | "vlrUrl" | "photoImageId">;
  teamLogoImageId: number | null;
  points?: number | null;
  size?: "default" | "dense" | "compact";
  struckOut?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
}

export function CoachBadge() {
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

const CHIP_SIZES = {
  default: {
    gap: "9px",
    padding: "6px",
    radius: "9px",
    photo: 30,
    handle: 14,
    points: 13,
  },
  dense: {
    gap: "7px",
    padding: "2px 4px",
    radius: "var(--radius-sm)",
    photo: 26,
    handle: 13,
    points: 13,
  },
  compact: {
    gap: "6px",
    padding: "6px 4px",
    radius: "9px",
    photo: 30,
    handle: 13,
    points: 12,
  },
} as const;

export default function PlayerChip({
  pickable,
  teamLogoImageId,
  points,
  size = "default",
  struckOut = false,
  onClick,
  ...ariaProps
}: PlayerChipProps) {
  const chipSize = CHIP_SIZES[size];
  return (
    <Box
      {...chipElement(pickable.vlrUrl, onClick)}
      {...ariaProps}
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: chipSize.gap,
          p: chipSize.padding,
          minWidth: 0,
          border: 0,
          borderRadius: chipSize.radius,
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
        size={chipSize.photo}
      />
      <Typography
        variant="bodyStrong"
        noWrap
        title={pickable.handle}
        sx={[
          { minWidth: 0, fontSize: chipSize.handle },
          struckOut && { textDecoration: "line-through" },
        ]}
      >
        {pickable.handle}
      </Typography>
      {pickable.kind === "coach" && <CoachBadge />}
      {points !== undefined && (
        <Points
          points={points}
          sx={{ ml: "auto", fontSize: chipSize.points }}
        />
      )}
    </Box>
  );
}
