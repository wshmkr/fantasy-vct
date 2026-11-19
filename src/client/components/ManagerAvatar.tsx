import Avatar from "@mui/material/Avatar";
import { displayNameOf, type ManagerColor, type User } from "@shared/entities";

interface ManagerAvatarProps {
  user: Pick<User, "discordUsername" | "displayName" | "avatarUrl">;
  size: number;
  ringColor?: ManagerColor;
  tightRing?: boolean;
  dimmed?: boolean;
}

export default function ManagerAvatar({
  user,
  size,
  ringColor,
  tightRing = false,
  dimmed = false,
}: ManagerAvatarProps) {
  const name = displayNameOf(user);
  return (
    <Avatar
      src={user.avatarUrl ?? undefined}
      alt={name}
      sx={[
        {
          width: size,
          height: size,
          fontSize: size * 0.4,
          fontWeight: 600,
          color: "var(--ink)",
          bgcolor: "var(--neutral-badge)",
          boxShadow: "inset 0 1px 0 #ffffff1f",
        },
        Boolean(ringColor) && {
          boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px var(--${ringColor})`,
        },
        Boolean(ringColor) &&
          tightRing && { boxShadow: `0 0 0 1.5px var(--${ringColor})` },
        dimmed && {
          bgcolor: "transparent",
          color: "var(--ink-muted)",
          border: "1px dashed var(--line)",
          boxShadow: "none",
          opacity: 0.6,
        },
      ]}
    >
      {name.charAt(0).toUpperCase()}
    </Avatar>
  );
}
