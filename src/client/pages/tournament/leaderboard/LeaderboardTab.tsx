import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { LeaderboardRow } from "@shared/api";
import {
  displayNameOf,
  type PickableKind,
  type Team,
  type Tournament,
} from "@shared/entities";
import type { ScoringConfig } from "@shared/scoring";
import { CornerDownRight, GraduationCap, User } from "lucide-react";
import { useState } from "react";
import ManagerStack from "../../../components/ManagerStack";
import ManagerToggles from "../../../components/ManagerToggles";
import Pane from "../../../components/Pane";
import PlayerChip from "../../../components/PlayerChip";
import Points from "../../../components/Points";
import SearchField from "../../../components/SearchField";
import SegmentedControl, {
  type Segment,
} from "../../../components/SegmentedControl";
import SortHeader from "../../../components/SortHeader";
import TeamToggles from "../../../components/TeamToggles";
import { useLeaderboard } from "../../../leaderboard";
import {
  columnValue,
  countPoints,
  DEFAULT_LEADERBOARD_SORT,
  formatColumnValue,
  LEADERBOARD_COLUMNS,
  type LeaderboardColumnKey,
  leaderboardRows,
  nextLeaderboardSort,
} from "./leaderboardView";

const TOTAL_SCOPE = "total";
type Scope = typeof TOTAL_SCOPE | number;

const KIND_SEGMENTS: Segment<PickableKind>[] = [
  { key: "player", label: "Players", Icon: User },
  { key: "coach", label: "Coaches", Icon: GraduationCap },
];

const GRID_COLUMNS: Record<PickableKind, string> = {
  player:
    "64px 48px minmax(150px, 1fr) 52px repeat(7, 46px) repeat(9, 36px) 52px",
  coach: "64px 48px minmax(180px, 1fr) 52px 112px 148px 64px",
};

const gridOf = (kind: PickableKind) => ({
  display: "grid",
  gridTemplateColumns: GRID_COLUMNS[kind],
  gap: "6px",
  alignItems: "center",
  px: "8px",
});

// Raw counts sit after PTS and the rate stats, so they read quieter.
const MUTED_KEYS = new Set<LeaderboardColumnKey>([
  "maps",
  "k",
  "d",
  "a",
  "fk",
  "fd",
  "mk3",
  "mk4",
  "aces",
  "clutches",
  "bonus",
]);

function toggled(ids: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

function teamsOf(rows: LeaderboardRow[]): Team[] {
  const byId = new Map(rows.map((row) => [row.team.id, row.team]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function StatCell({
  columnKey,
  row,
  scoring,
  ownerName,
}: {
  columnKey: LeaderboardColumnKey;
  row: LeaderboardRow;
  scoring: ScoringConfig;
  ownerName: (userId: number) => string;
}) {
  const value = columnValue(row, columnKey, ownerName);
  if (columnKey === "points") {
    return (
      <Box role="cell" sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Points points={row.points} />
      </Box>
    );
  }
  const cell = (
    <Typography
      variant="stat"
      sx={[
        { textAlign: "right" },
        MUTED_KEYS.has(columnKey) && { color: "var(--ink-muted)" },
        columnKey === "rating" && { fontWeight: 600 },
      ]}
    >
      {formatColumnValue(columnKey, value)}
    </Typography>
  );
  const pointsWorth = countPoints(columnKey, value, scoring);
  return (
    <Box role="cell" sx={{ display: "flex", justifyContent: "flex-end" }}>
      {pointsWorth ? (
        <Tooltip title={pointsWorth} placement="top">
          {cell}
        </Tooltip>
      ) : (
        cell
      )}
    </Box>
  );
}

function LeaderboardRowView({
  row,
  tournament,
  scoring,
  ownerName,
}: {
  row: LeaderboardRow;
  tournament: Tournament;
  scoring: ScoringConfig;
  ownerName: (userId: number) => string;
}) {
  const owners = row.ownerUserIds.flatMap(
    (userId) =>
      tournament.members.find((member) => member.user.id === userId) ?? [],
  );
  return (
    <Box
      role="row"
      aria-label={row.pickable.handle}
      sx={{
        ...gridOf(row.pickable.kind),
        height: 42,
        flex: "none",
        borderRadius: "var(--radius-md)",
        transition: "background-color 150ms ease-out",
        "&:hover": { bgcolor: "var(--pane-hover)" },
      }}
    >
      {LEADERBOARD_COLUMNS[row.pickable.kind].map(({ key }) => {
        if (key === "owners") {
          return (
            <Box key={key} role="cell" sx={{ display: "flex", minWidth: 0 }}>
              <ManagerStack
                members={owners}
                size={22}
                overlap={6}
                ring="tight"
              />
            </Box>
          );
        }
        if (key === "pickable") {
          return (
            <Box
              key={key}
              role="cell"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                minWidth: 0,
              }}
            >
              <PlayerChip
                pickable={row.pickable}
                teamLogoImageId={row.team.logoImageId}
                size="dense"
              />
              {row.subHandles.length > 0 && (
                <Tooltip title={row.subHandles.join(", ")}>
                  <Box
                    component="span"
                    role="img"
                    aria-label={`Subs: ${row.subHandles.join(", ")}`}
                    sx={{
                      display: "flex",
                      flex: "none",
                      color: "var(--ink-muted)",
                    }}
                  >
                    <CornerDownRight size={14} aria-hidden />
                  </Box>
                </Tooltip>
              )}
            </Box>
          );
        }
        return (
          <StatCell
            key={key}
            columnKey={key}
            row={row}
            scoring={scoring}
            ownerName={ownerName}
          />
        );
      })}
    </Box>
  );
}

export default function LeaderboardTab({
  tournament,
}: {
  tournament: Tournament;
}) {
  const leaderboard = useLeaderboard(tournament.id).data;
  const [pickedScope, setScope] = useState<Scope>(TOTAL_SCOPE);
  const [kind, setKind] = useState<PickableKind>("player");
  const [search, setSearch] = useState("");
  const [teamIds, setTeamIds] = useState<ReadonlySet<number>>(new Set());
  const [ownerUserIds, setOwnerUserIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [undrafted, setUndrafted] = useState(false);
  const [sort, setSort] = useState(DEFAULT_LEADERBOARD_SORT);

  const scopeSegments: Segment<Scope>[] = [
    { key: TOTAL_SCOPE, label: "Total" },
    ...tournament.stages.map((stage) => ({ key: stage.id, label: stage.name })),
  ];
  const scope = tournament.stages.some(({ id }) => id === pickedScope)
    ? pickedScope
    : TOTAL_SCOPE;
  const scopeRows =
    leaderboard?.scopes.find(
      ({ stageId }) => stageId === (scope === TOTAL_SCOPE ? null : scope),
    )?.rows ?? [];
  const scopeTeams = teamsOf(scopeRows);
  // A team picked in another scope stays selected but can't hide this scope's rows.
  const visibleTeamIds = new Set(
    scopeTeams.flatMap(({ id }) => (teamIds.has(id) ? [id] : [])),
  );
  const ownerName = (userId: number) => {
    const member = tournament.members.find(({ user }) => user.id === userId);
    return member ? displayNameOf(member.user) : "";
  };
  // A sort on a players-only column falls back to PTS for coaches.
  const activeSort = LEADERBOARD_COLUMNS[kind].some(
    ({ key }) => key === sort.key,
  )
    ? sort
    : DEFAULT_LEADERBOARD_SORT;
  const rows = leaderboardRows(
    scopeRows,
    { kind, search, teamIds: visibleTeamIds, ownerUserIds, undrafted },
    activeSort,
    ownerName,
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <SegmentedControl
        segments={scopeSegments}
        selectedKey={scope}
        onSelect={setScope}
        ariaLabel="Scope"
      />
      <Pane
        dense
        component="section"
        aria-label="Leaderboard"
        sx={{ display: "flex", flexDirection: "column", gap: "12px" }}
      >
        <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <SearchField
            value={search}
            onChange={setSearch}
            ariaLabel="Search players or teams"
          />
          <ManagerToggles
            members={tournament.members}
            selectedUserIds={ownerUserIds}
            undraftedSelected={undrafted}
            onToggleManager={(userId) =>
              setOwnerUserIds(toggled(ownerUserIds, userId))
            }
            onToggleUndrafted={() => setUndrafted(!undrafted)}
          />
          <SegmentedControl
            segments={KIND_SEGMENTS}
            selectedKey={kind}
            onSelect={setKind}
            ariaLabel="Kind"
            inPane
            iconOnly
          />
        </Box>
        <TeamToggles
          teams={scopeTeams}
          selectedTeamIds={teamIds}
          onToggle={(teamId) => setTeamIds(toggled(teamIds, teamId))}
        />
        <Box role="table" aria-label="Leaderboard">
          <SortHeader
            columns={LEADERBOARD_COLUMNS[kind]}
            sort={activeSort}
            onSort={(key) => setSort(nextLeaderboardSort(activeSort, key))}
            sx={{
              ...gridOf(kind),
              position: "sticky",
              top: 0,
              zIndex: 1,
              pt: "8px",
              bgcolor: "var(--pane-dense)",
              backdropFilter: "blur(12px)",
            }}
          />
          <Box sx={{ display: "flex", flexDirection: "column", pt: "4px" }}>
            {leaderboard &&
              rows.map((row) => (
                <LeaderboardRowView
                  key={row.pickable.id}
                  row={row}
                  tournament={tournament}
                  scoring={leaderboard.scoring}
                  ownerName={ownerName}
                />
              ))}
          </Box>
        </Box>
      </Pane>
    </Box>
  );
}
