import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import type {
  MatchDetail,
  MatchPick,
  MatchSub,
  MatchTeamDetail,
} from "@shared/api";
import type { TeamSide, TournamentMember } from "@shared/entities";
import type { MapStatLine } from "@shared/scoring";
import { CornerDownRight, TriangleAlert } from "lucide-react";
import type { ChangeEvent } from "react";
import ManagerStack from "../../../components/ManagerStack";
import Pane from "../../../components/Pane";
import PlayerChip from "../../../components/PlayerChip";
import Points from "../../../components/Points";
import StatusBadge from "../../../components/StatusBadge";
import TeamLogo from "../../../components/TeamLogo";
import { useAssignSub, useMatch } from "../../../matches";
import {
  bestOfLabel,
  formatDay,
  formatTime,
  matchWinner,
  type SubRow,
  sideScoreLabel,
  teamTableRows,
  winnerSide,
} from "./matchView";

const STAT_COLUMNS: { label: string; key: keyof MapStatLine }[] = [
  { label: "K", key: "k" },
  { label: "D", key: "d" },
  { label: "A", key: "a" },
  { label: "FK", key: "fk" },
  { label: "FD", key: "fd" },
  { label: "3K", key: "mk3" },
  { label: "4K", key: "mk4" },
  { label: "ACE", key: "aces" },
  { label: "CL", key: "clutches" },
];

const TABLE_COLUMNS = `minmax(0, 1fr) repeat(${STAT_COLUMNS.length}, 40px) 52px`;
const NO_ASSIGNMENT = "";
const CREDIT_NOBODY = "none";

const tableRowSx = {
  display: "grid",
  gridTemplateColumns: TABLE_COLUMNS,
  alignItems: "center",
  gap: "4px",
  height: 34,
  px: "8px",
  borderTop: "1px solid #ffffff0d",
} as const;

function StatCells({ stats }: { stats: MapStatLine | null }) {
  return STAT_COLUMNS.map(({ key }) => (
    <Typography
      key={key}
      variant="stat"
      sx={{ textAlign: "right", fontSize: 12, color: "var(--ink-muted)" }}
    >
      {stats?.[key]}
    </Typography>
  ));
}

function PickRow({
  pick,
  teamLogoImageId,
  owner,
}: {
  pick: MatchPick;
  teamLogoImageId: number | null;
  owner: TournamentMember | undefined;
}) {
  const ownerColor = owner && `var(--${owner.color})`;
  return (
    <Box
      sx={[
        tableRowSx,
        Boolean(ownerColor) && {
          background: `linear-gradient(90deg, color-mix(in srgb, ${ownerColor} 10%, transparent), transparent 60%)`,
        },
      ]}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}
      >
        <PlayerChip
          pickable={pick.pickable}
          teamLogoImageId={teamLogoImageId}
          size="dense"
        />
        {owner && <ManagerStack members={[owner]} size={18} ring="tight" />}
      </Box>
      <StatCells stats={pick.playerStatTotals} />
      <Points points={pick.points} sx={{ fontSize: 13, fontWeight: 700 }} />
    </Box>
  );
}

function SubAssignmentSelect({
  matchId,
  sub,
  handleOf,
}: {
  matchId: number;
  sub: MatchSub;
  handleOf: (pickableId: number) => string;
}) {
  const assignSub = useAssignSub(matchId);
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        ml: "4px",
        color: "var(--accent-text)",
      }}
    >
      <TriangleAlert size={14} aria-hidden />
      <Box
        component="select"
        aria-label={`${sub.handle} replaces`}
        value={NO_ASSIGNMENT}
        disabled={assignSub.isPending}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          const choice = event.target.value;
          if (choice === NO_ASSIGNMENT) return;
          assignSub.mutate({
            mapNo: sub.mapNo,
            subVlrPlayerId: sub.vlrPlayerId,
            replacesPickableId:
              choice === CREDIT_NOBODY ? null : Number(choice),
          });
        }}
        sx={{
          height: 24,
          px: "6px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--line)",
          bgcolor: "#18181b",
          color: "var(--ink)",
          font: "inherit",
          fontSize: 12,
        }}
      >
        <option value={NO_ASSIGNMENT}>–</option>
        {sub.missingPickableIds.map((pickableId) => (
          <option key={pickableId} value={pickableId}>
            {handleOf(pickableId)}
          </option>
        ))}
        <option value={CREDIT_NOBODY}>None</option>
      </Box>
    </Box>
  );
}

function SubTableRow({
  sub,
  matchId,
  canAssign,
  handleOf,
}: {
  sub: SubRow;
  matchId: number;
  canAssign: boolean;
  handleOf: (pickableId: number) => string;
}) {
  return (
    <Box sx={[tableRowSx, { pl: "12px" }]}>
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}
      >
        <CornerDownRight
          size={14}
          color="var(--ink-muted)"
          aria-label="Sub"
          role="img"
          style={{ flex: "none" }}
        />
        <Typography
          noWrap
          sx={{ fontSize: 13, fontWeight: 600, color: "var(--ink-muted)" }}
        >
          {sub.handle}
        </Typography>
        {sub.mapName && (
          <Typography
            variant="label"
            sx={{ fontSize: 10, color: "var(--ink-muted)", opacity: 0.75 }}
          >
            {sub.mapName}
          </Typography>
        )}
        {canAssign && sub.unassigned && (
          <SubAssignmentSelect
            matchId={matchId}
            sub={sub.unassigned}
            handleOf={handleOf}
          />
        )}
      </Box>
      <StatCells stats={sub.stats} />
      <span />
    </Box>
  );
}

function TeamTable({
  match,
  team,
  members,
  isCommissioner,
}: {
  match: MatchDetail;
  team: MatchTeamDetail;
  members: TournamentMember[];
  isCommissioner: boolean;
}) {
  const handleOf = (pickableId: number) =>
    team.picks.find(({ pickable }) => pickable.id === pickableId)?.pickable
      .handle ?? "–";
  const mapNameOf = (mapNo: number) =>
    match.maps.find((map) => map.mapNo === mapNo)?.mapName ?? null;
  return (
    <Box
      role="group"
      aria-label={team.name}
      sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}
    >
      <Box sx={{ ...tableRowSx, height: 28, borderTop: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <TeamLogo imageId={team.logoImageId} size={20} />
          <Typography variant="bodyStrong" sx={{ fontSize: 13 }}>
            {team.name}
          </Typography>
        </Box>
        {[...STAT_COLUMNS.map(({ label }) => label), "PTS"].map((label) => (
          <Typography
            key={label}
            variant="label"
            sx={{
              textAlign: "right",
              fontSize: 10,
              letterSpacing: "0.06em",
              color: "var(--ink-muted)",
            }}
          >
            {label}
          </Typography>
        ))}
      </Box>
      {teamTableRows(team, mapNameOf).map((row) =>
        row.kind === "pick" ? (
          <PickRow
            key={row.pick.pickable.id}
            pick={row.pick}
            teamLogoImageId={team.logoImageId}
            owner={members.find(({ user }) => user.id === row.pick.ownerUserId)}
          />
        ) : (
          <SubTableRow
            key={row.sub.key}
            sub={row.sub}
            matchId={match.id}
            canAssign={isCommissioner}
            handleOf={handleOf}
          />
        ),
      )}
    </Box>
  );
}

function ScorePair({
  team1,
  team2,
  winner,
  separator,
  separatorGap = 0,
  sx,
}: {
  team1: number | string | null;
  team2: number | string | null;
  winner: TeamSide | null;
  separator: string;
  separatorGap?: string | number;
  sx: SxProps<Theme>;
}) {
  const sideSx = (dimmed: boolean) => ({
    color: dimmed ? "var(--ink-muted)" : "var(--ink)",
  });
  return (
    <Typography variant="stat" sx={sx}>
      <Box component="span" sx={sideSx(winner === 2)}>
        {team1 ?? "–"}
      </Box>
      <Box component="span" sx={{ color: "#52525b", mx: separatorGap }}>
        {separator}
      </Box>
      <Box component="span" sx={sideSx(winner === 1)}>
        {team2 ?? "–"}
      </Box>
    </Typography>
  );
}

function DetailHeader({ match }: { match: MatchDetail }) {
  const winner = matchWinner(match);
  const teamSx = (dimmed: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: 20,
    fontWeight: 600,
    color: dimmed ? "var(--ink-muted)" : "var(--ink)",
  });
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      <Typography sx={teamSx(winner === 2)}>
        <TeamLogo imageId={match.team1?.logoImageId ?? null} size={32} />
        {match.team1?.name}
      </Typography>
      <ScorePair
        team1={sideScoreLabel(match, 1)}
        team2={sideScoreLabel(match, 2)}
        winner={winner}
        separator=":"
        separatorGap="8px"
        sx={{ fontSize: 24, fontWeight: 700 }}
      />
      <Typography sx={teamSx(winner === 1)}>
        {match.team2?.name}
        <TeamLogo imageId={match.team2?.logoImageId ?? null} size={32} />
      </Typography>
      <Box sx={{ flex: 1 }} />
      {match.status === "live" && <StatusBadge status="live" />}
      <Typography
        variant="stat"
        sx={{ fontSize: 12, color: "var(--ink-muted)" }}
      >
        {[
          formatDay(match.scheduledAt),
          formatTime(match.scheduledAt),
          bestOfLabel(match.bestOf),
        ].join(" · ")}
      </Typography>
    </Box>
  );
}

function MapChips({ match }: { match: MatchDetail }) {
  return (
    <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {match.maps.map((map) => {
        return (
          <Box
            key={map.mapNo}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              p: "4px 10px",
              borderRadius: "var(--radius-sm)",
              bgcolor: "var(--pane)",
              boxShadow: "inset 0 0 0 1px #ffffff12",
              fontSize: 12,
            }}
          >
            <Typography
              sx={{ fontSize: 12, fontWeight: 500, color: "var(--ink-muted)" }}
            >
              {map.mapName}
            </Typography>
            <ScorePair
              team1={map.team1Rounds}
              team2={map.team2Rounds}
              winner={winnerSide(map.team1Rounds, map.team2Rounds)}
              separator="–"
              sx={{ fontSize: 12, fontWeight: 600 }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

export default function MatchDetailPanel({
  tournamentId,
  matchId,
  members,
  isCommissioner,
}: {
  tournamentId: number;
  matchId: number;
  members: TournamentMember[];
  isCommissioner: boolean;
}) {
  const match = useMatch(tournamentId, matchId).data;
  return (
    <Pane
      dense
      component="section"
      aria-label="Match detail"
      sx={{
        flex: "999 1 560px",
        minWidth: 0,
        position: "sticky",
        top: 16,
        p: "20px 22px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      {match && (
        <>
          <DetailHeader match={match} />
          {match.forfeitWinner === null ? (
            <MapChips match={match} />
          ) : (
            <Typography sx={{ fontSize: 13, color: "var(--ink-muted)" }}>
              Forfeit
            </Typography>
          )}
          {[match.team1, match.team2].map(
            (team) =>
              team && (
                <TeamTable
                  key={team.id}
                  match={match}
                  team={team}
                  members={members}
                  isCommissioner={isCommissioner}
                />
              ),
          )}
        </>
      )}
    </Pane>
  );
}
