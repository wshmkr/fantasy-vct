import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { TeamWithPickables } from "@shared/entities";
import { Pencil, Search } from "lucide-react";
import { useState } from "react";
import Pane from "../../components/Pane";
import PlayerChip from "../../components/PlayerChip";
import SmallIconButton from "../../components/SmallIconButton";
import TeamLogo from "../../components/TeamLogo";
import { useTournamentTeams } from "../../tournaments";
import { useMe } from "../../useMe";
import TeamRosterDialog from "./TeamRosterDialog";

function matchesSearch(team: TeamWithPickables, search: string) {
  const needle = search.trim().toLowerCase();
  return [team.name, ...team.pickables.map((p) => p.handle)].some((name) =>
    name.toLowerCase().includes(needle),
  );
}

function TeamCard({
  team,
  onEdit,
}: {
  team: TeamWithPickables;
  onEdit: (() => void) | null;
}) {
  return (
    <Pane
      component="section"
      aria-label={team.name}
      sx={{ display: "flex", flexDirection: "column", gap: "10px" }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "10px", px: "4px" }}
      >
        <TeamLogo imageId={team.logoImageId} size={28} />
        <Typography
          variant="bodyStrong"
          component="h2"
          noWrap
          sx={{ fontSize: 15, flex: 1 }}
        >
          {team.name}
        </Typography>
        {onEdit && (
          <SmallIconButton label={`Edit ${team.name} roster`} onClick={onEdit}>
            <Pencil size={13} />
          </SmallIconButton>
        )}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "4px 8px",
        }}
      >
        {team.pickables.map((pickable) => (
          <PlayerChip
            key={pickable.id}
            pickable={pickable}
            teamLogoImageId={team.logoImageId}
            points={pickable.points}
            size="compact"
          />
        ))}
      </Box>
    </Pane>
  );
}

export default function TeamsTab({ tournamentId }: { tournamentId: number }) {
  const teams = useTournamentTeams(tournamentId);
  const isCommissioner = useMe().data?.role === "commissioner";
  const [search, setSearch] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const editingTeam = teams.data?.find((team) => team.id === editingTeamId);
  const shownTeams = (teams.data ?? []).filter((team) =>
    matchesSearch(team, search),
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <InputBase
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          inputProps={{ "aria-label": "Search teams or players" }}
          startAdornment={
            <Search
              size={15}
              color="var(--ink-muted)"
              aria-hidden
              style={{ marginRight: 8, flex: "none" }}
            />
          }
          sx={{ width: 320, height: 38, px: "10px", fontSize: 13 }}
        />
        <Tooltip title="Teams">
          <Typography
            variant="stat"
            aria-label="Teams"
            sx={{ color: "var(--ink-muted)" }}
          >
            {shownTeams.length}
          </Typography>
        </Tooltip>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "16px",
        }}
      >
        {shownTeams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            onEdit={isCommissioner ? () => setEditingTeamId(team.id) : null}
          />
        ))}
      </Box>
      {editingTeam && (
        <TeamRosterDialog
          team={editingTeam}
          onClose={() => setEditingTeamId(null)}
        />
      )}
    </Box>
  );
}
