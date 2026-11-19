import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { MatchSummary, MatchTeamSummary } from "@shared/api";
import { displayNameOf, type TournamentMember } from "@shared/entities";
import { TriangleAlert } from "lucide-react";
import ManagerAvatar from "../../../components/ManagerAvatar";
import Pane from "../../../components/Pane";
import StatusBadge from "../../../components/StatusBadge";
import TeamLogo from "../../../components/TeamLogo";
import {
  bestOfLabel,
  formatDay,
  formatTime,
  isSelectable,
  type ScheduleDay,
  winnerSide,
} from "./matchView";

function alertLabelOf(match: MatchSummary) {
  return match.scrapeStatus === "failed" ? "Scrape failed" : "Assign subs";
}

function TeamLine({
  team,
  dimmed,
  scoreDimmed,
  members,
}: {
  team: MatchTeamSummary | null;
  dimmed: boolean;
  scoreDimmed: boolean;
  members: TournamentMember[];
}) {
  const owners = members.filter(({ user }) =>
    team?.ownerUserIds.includes(user.id),
  );
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        height: 22,
        minWidth: 0,
      }}
    >
      <TeamLogo imageId={team?.logoImageId ?? null} size={20} />
      <Typography
        noWrap
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: dimmed ? 500 : 600,
          color: dimmed ? "var(--ink-muted)" : "var(--ink)",
        }}
      >
        {team?.name ?? "TBD"}
      </Typography>
      <Box sx={{ display: "flex", gap: "3px", flex: "none", pr: "2px" }}>
        {owners.map(({ user, color }) => (
          <Tooltip key={user.id} title={displayNameOf(user)}>
            <Box sx={{ display: "flex" }}>
              <ManagerAvatar
                user={user}
                size={16}
                ringColor={color}
                tightRing
              />
            </Box>
          </Tooltip>
        ))}
      </Box>
      <Typography
        variant="stat"
        sx={{
          width: 16,
          flex: "none",
          textAlign: "right",
          fontSize: 15,
          fontWeight: 700,
          color: scoreDimmed ? "var(--ink-muted)" : "var(--ink)",
        }}
      >
        {team?.score ?? "–"}
      </Typography>
    </Box>
  );
}

function ScheduleRow({
  match,
  selected,
  onSelect,
  members,
  showAlert,
}: {
  match: MatchSummary;
  selected: boolean;
  onSelect: () => void;
  members: TournamentMember[];
  showAlert: boolean;
}) {
  const selectable = isSelectable(match);
  const winner =
    match.status === "completed"
      ? winnerSide(match.team1?.score ?? null, match.team2?.score ?? null)
      : null;
  const hasScore = match.status !== "upcoming";
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={selected}
      aria-label={`${match.team1?.name ?? "TBD"} vs ${match.team2?.name ?? "TBD"}`}
      disabled={!selectable}
      onClick={onSelect}
      sx={[
        {
          width: "100%",
          display: "grid",
          gridTemplateColumns: "44px minmax(0, 1fr) 18px",
          alignItems: "center",
          gap: "12px",
          p: "10px 8px",
          border: 0,
          borderRadius: "10px",
          bgcolor: "transparent",
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          cursor: selectable ? "pointer" : "default",
          transition: "background-color 150ms ease-out",
        },
        selectable && { "&:hover": { bgcolor: "#ffffff0d" } },
        selected && {
          bgcolor: "var(--pane-hover)",
          boxShadow:
            "inset 2px 0 0 var(--accent), inset 0 0 0 1px var(--pane-edge)",
          "&:hover": { bgcolor: "var(--pane-hover)" },
        },
      ]}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "4px",
        }}
      >
        {match.status === "live" ? (
          <StatusBadge status="live" compact />
        ) : (
          <Typography
            variant="stat"
            sx={{ fontSize: 13, color: "var(--ink-muted)" }}
          >
            {formatTime(match.scheduledAt)}
          </Typography>
        )}
        <Typography
          variant="label"
          sx={{
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "var(--ink-muted)",
            opacity: 0.75,
          }}
        >
          {bestOfLabel(match.bestOf)}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: 0,
        }}
      >
        <TeamLine
          team={match.team1}
          dimmed={winner === 2}
          scoreDimmed={!hasScore || winner === 2}
          members={members}
        />
        <TeamLine
          team={match.team2}
          dimmed={winner === 1}
          scoreDimmed={!hasScore || winner === 1}
          members={members}
        />
      </Box>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        {showAlert && match.needsAttention && (
          <Tooltip title={alertLabelOf(match)}>
            <TriangleAlert
              size={16}
              color="var(--accent-text)"
              role="img"
              aria-label={alertLabelOf(match)}
            />
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default function ScheduleList({
  days,
  selectedMatchId,
  onSelect,
  members,
  isCommissioner,
}: {
  days: ScheduleDay[];
  selectedMatchId: number | undefined;
  onSelect: (matchId: number) => void;
  members: TournamentMember[];
  isCommissioner: boolean;
}) {
  return (
    <Pane
      dense
      component="section"
      aria-label="Schedule"
      sx={{
        flex: "1 1 420px",
        maxWidth: 420,
        minWidth: 0,
        p: "4px 10px 10px",
      }}
    >
      {days.map((day) => (
        <Box
          key={day.key}
          role="group"
          aria-label={formatDay(day.scheduledAt)}
          sx={{ display: "flex", flexDirection: "column" }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
              p: "16px 8px 8px",
            }}
          >
            <Typography variant="bodyStrong" sx={{ fontSize: 14 }}>
              {formatDay(day.scheduledAt)}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "var(--ink-muted)" }}>
              {day.matches.length}{" "}
              {day.matches.length === 1 ? "match" : "matches"}
            </Typography>
          </Box>
          {day.matches.map((match) => (
            <ScheduleRow
              key={match.id}
              match={match}
              selected={match.id === selectedMatchId}
              onSelect={() => onSelect(match.id)}
              members={members}
              showAlert={isCommissioner}
            />
          ))}
        </Box>
      ))}
    </Pane>
  );
}
