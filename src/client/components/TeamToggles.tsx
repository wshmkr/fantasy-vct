import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import type { Team } from "@shared/entities";
import TeamLogo from "./TeamLogo";

export default function TeamToggles({
  teams,
  selectedTeamIds,
  onToggle,
}: {
  teams: Team[];
  selectedTeamIds: ReadonlySet<number>;
  onToggle: (teamId: number) => void;
}) {
  return (
    <Box
      role="group"
      aria-label="Teams"
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(teams.length, 8)}, minmax(0, 1fr))`,
        gap: "4px",
      }}
    >
      {teams.map((team) => {
        const isSelected = selectedTeamIds.has(team.id);
        return (
          <Tooltip key={team.id} title={team.name}>
            <ButtonBase
              aria-label={team.name}
              aria-pressed={isSelected}
              onClick={() => onToggle(team.id)}
              sx={[
                {
                  height: 30,
                  borderRadius: "var(--radius-sm)",
                  bgcolor: "#ffffff08",
                  boxShadow: "inset 0 0 0 1px var(--pane-edge)",
                  opacity: selectedTeamIds.size > 0 ? 0.55 : 1,
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
              <TeamLogo imageId={team.logoImageId} size={18} />
            </ButtonBase>
          </Tooltip>
        );
      })}
    </Box>
  );
}
