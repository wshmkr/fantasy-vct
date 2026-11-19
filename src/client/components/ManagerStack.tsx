import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import { displayNameOf, type TournamentMember } from "@shared/entities";
import ManagerAvatar, { type AvatarRing } from "./ManagerAvatar";

interface ManagerStackProps {
  members: TournamentMember[];
  size: number;
  overlap?: number;
  gap?: number;
  ring?: AvatarRing;
  myUserId?: number;
  onMyAvatarClick?: (anchor: HTMLElement) => void;
}

export default function ManagerStack({
  members,
  size,
  overlap = 0,
  gap = 0,
  ring,
  myUserId,
  onMyAvatarClick,
}: ManagerStackProps) {
  if (members.length === 0) return null;
  return (
    <Box
      sx={{
        display: "inline-flex",
        gap: `${gap}px`,
        pl: `${overlap}px`,
      }}
    >
      {members.map(({ user, color }) => {
        const avatar = (
          <ManagerAvatar
            user={user}
            size={size}
            ringColor={color}
            ring={ring}
          />
        );
        const isMine = user.id === myUserId && onMyAvatarClick;
        return (
          <Tooltip key={user.id} title={displayNameOf(user)}>
            <Box sx={{ ml: `-${overlap}px`, display: "flex" }}>
              {isMine ? (
                <ButtonBase
                  aria-label="Your color"
                  onClick={(event) => onMyAvatarClick(event.currentTarget)}
                  sx={{ borderRadius: "50%" }}
                >
                  {avatar}
                </ButtonBase>
              ) : (
                avatar
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
