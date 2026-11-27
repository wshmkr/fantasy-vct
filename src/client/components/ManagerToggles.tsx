import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import { displayNameOf, type TournamentMember } from "@shared/entities";
import { CircleDashed } from "lucide-react";
import type { ReactNode } from "react";
import ManagerAvatar from "./ManagerAvatar";

function Toggle({
  label,
  isSelected,
  anySelected,
  onToggle,
  children,
}: {
  label: string;
  isSelected: boolean;
  anySelected: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <ButtonBase
        aria-label={label}
        aria-pressed={isSelected}
        onClick={onToggle}
        sx={[
          {
            width: 36,
            height: 30,
            borderRadius: "var(--radius-sm)",
            bgcolor: "#ffffff08",
            boxShadow: "inset 0 0 0 1px var(--pane-edge)",
            color: "var(--ink-muted)",
            opacity: anySelected ? 0.55 : 1,
            transition: "opacity 150ms ease-out, background-color 150ms",
            "&:hover": { opacity: 1 },
          },
          isSelected && {
            opacity: 1,
            bgcolor: "#ffffff1f",
            boxShadow: "inset 0 0 0 1px var(--pane-highlight)",
          },
        ]}
      >
        {children}
      </ButtonBase>
    </Tooltip>
  );
}

export default function ManagerToggles({
  members,
  selectedUserIds,
  undraftedSelected,
  onToggleManager,
  onToggleUndrafted,
}: {
  members: TournamentMember[];
  selectedUserIds: ReadonlySet<number>;
  undraftedSelected: boolean;
  onToggleManager: (userId: number) => void;
  onToggleUndrafted: () => void;
}) {
  const anySelected = selectedUserIds.size > 0 || undraftedSelected;
  return (
    <Box
      role="group"
      aria-label="Managers"
      sx={{ display: "flex", gap: "4px", flex: "none" }}
    >
      {members.map(({ user, color }) => (
        <Toggle
          key={user.id}
          label={displayNameOf(user)}
          isSelected={selectedUserIds.has(user.id)}
          anySelected={anySelected}
          onToggle={() => onToggleManager(user.id)}
        >
          <ManagerAvatar user={user} size={18} ringColor={color} ring="tight" />
        </Toggle>
      ))}
      <Toggle
        label="Undrafted"
        isSelected={undraftedSelected}
        anySelected={anySelected}
        onToggle={onToggleUndrafted}
      >
        <CircleDashed size={16} aria-hidden />
      </Toggle>
    </Box>
  );
}
