import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ManagerStanding, StandingsPick } from "@shared/api";
import {
  displayNameOf,
  isDraftRunning,
  type Stage,
  type Tournament,
  type TournamentMember,
} from "@shared/entities";
import { Lock } from "lucide-react";
import { type ReactNode, useState } from "react";
import ManagerAvatar from "../../components/ManagerAvatar";
import Pane from "../../components/Pane";
import PlayerChip from "../../components/PlayerChip";
import Points from "../../components/Points";
import ProgressBar from "../../components/ProgressBar";
import Rank from "../../components/Rank";
import SegmentedControl, {
  type Segment,
} from "../../components/SegmentedControl";
import { useDraftStream } from "../../draft";
import { useStandings } from "../../tournaments";
import { PLAYER_SLOTS, splitRoster } from "./draft/draftView";

const ROW_HEIGHT = 34;
const TOTAL_SCOPE = "total";
type Scope = typeof TOTAL_SCOPE | number;

function StandingCard({
  manager,
  rank,
  points,
  locked,
  children,
}: {
  manager: TournamentMember;
  rank: number;
  points: number | null;
  locked: boolean;
  children: ReactNode;
}) {
  const color = `var(--${manager.color})`;
  const name = displayNameOf(manager.user);
  return (
    <Pane
      component="section"
      aria-label={name}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${color} 16%, transparent), color-mix(in srgb, ${color} 4%, transparent) 60%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 40%, transparent), var(--shadow-pane)`,
      }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "10px", px: "4px" }}
      >
        {points !== null && <Rank rank={rank} sx={{ width: 14 }} />}
        <ManagerAvatar
          user={manager.user}
          size={30}
          ringColor={manager.color}
        />
        <Typography variant="bodyStrong" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Typography>
        {locked && (
          <Tooltip title="Locked">
            <Lock
              size={13}
              color="var(--ink-muted)"
              aria-label="Locked"
              role="img"
            />
          </Tooltip>
        )}
        <Points
          points={points}
          sx={{
            fontSize: 20,
            lineHeight: "24px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        />
      </Box>
      {children}
    </Pane>
  );
}

function EmptyRow() {
  return (
    <Box
      sx={{
        borderRadius: "var(--radius-sm)",
        boxShadow: "inset 0 0 0 1px var(--line)",
        opacity: 0.35,
      }}
    />
  );
}

function StageRoster({ picks }: { picks: StandingsPick[] }) {
  const { players, coach } = splitRoster(picks, (pick) => pick.pickable.kind);
  const slots = [
    ...PLAYER_SLOTS.map((slot) => ({
      key: `player-${slot}`,
      pick: players[slot],
    })),
    { key: "coach", pick: coach },
  ];
  return (
    <Box sx={{ display: "grid", gridAutoRows: `${ROW_HEIGHT}px`, gap: "2px" }}>
      {slots.map(({ key, pick }) =>
        pick ? (
          <PlayerChip
            key={key}
            pickable={pick.pickable}
            teamLogoImageId={pick.teamLogoImageId}
            points={pick.points}
            size="dense"
          />
        ) : (
          <EmptyRow key={key} />
        ),
      )}
    </Box>
  );
}

function StageSubtotals({
  stages,
  manager,
  largestStagePoints,
}: {
  stages: Stage[];
  manager: ManagerStanding;
  largestStagePoints: number;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {stages.map((stage) => {
        const points =
          manager.stages.find(({ stageId }) => stageId === stage.id)?.points ??
          null;
        return (
          <Box
            key={stage.id}
            aria-label={stage.name}
            sx={{
              display: "grid",
              gridTemplateColumns: "84px minmax(0, 1fr) 56px",
              alignItems: "center",
              gap: "10px",
              height: 32,
              px: "6px",
            }}
          >
            <Typography
              variant="label"
              noWrap
              sx={{ color: "var(--ink-muted)" }}
            >
              {stage.name}
            </Typography>
            <ProgressBar
              done={Math.max(points ?? 0, 0)}
              total={largestStagePoints}
              fillColor={`var(--${manager.color})`}
            />
            <Points points={points} />
          </Box>
        );
      })}
    </Box>
  );
}

function TotalCards({
  managers,
  stages,
}: {
  managers: ManagerStanding[];
  stages: Stage[];
}) {
  const largestStagePoints = Math.max(
    0,
    ...managers.flatMap((manager) =>
      manager.stages.map((stage) => stage.points ?? 0),
    ),
  );
  return managers.map((manager) => (
    <StandingCard
      key={manager.user.id}
      manager={manager}
      rank={manager.rank}
      points={manager.points}
      locked={manager.locked}
    >
      <StageSubtotals
        stages={stages}
        manager={manager}
        largestStagePoints={largestStagePoints}
      />
    </StandingCard>
  ));
}

function StageCards({
  managers,
  stageId,
}: {
  managers: ManagerStanding[];
  stageId: number;
}) {
  return managers
    .map((manager) => ({
      manager,
      stage: manager.stages.find((row) => row.stageId === stageId),
    }))
    .sort((a, b) => (a.stage?.rank ?? 0) - (b.stage?.rank ?? 0))
    .map(({ manager, stage }) => (
      <StandingCard
        key={manager.user.id}
        manager={manager}
        rank={stage?.rank ?? 0}
        points={stage?.points ?? null}
        locked={stage?.locked ?? false}
      >
        <StageRoster picks={stage?.picks ?? []} />
      </StandingCard>
    ));
}

export default function RostersTab({ tournament }: { tournament: Tournament }) {
  const draftingStage = tournament.stages.find((stage) =>
    isDraftRunning(stage.status),
  );
  const [scope, setScope] = useState<Scope>(
    () => draftingStage?.id ?? TOTAL_SCOPE,
  );
  const managers = useStandings(tournament.id).data?.managers ?? [];
  useDraftStream(tournament.id, draftingStage?.id);
  const segments: Segment<Scope>[] = [
    { key: TOTAL_SCOPE, label: "Total" },
    ...tournament.stages.map((stage) => ({ key: stage.id, label: stage.name })),
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <SegmentedControl
        segments={segments}
        selectedKey={scope}
        onSelect={setScope}
        ariaLabel="Scope"
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "16px",
          alignItems: "start",
        }}
      >
        {scope === TOTAL_SCOPE ? (
          <TotalCards managers={managers} stages={tournament.stages} />
        ) : (
          <StageCards managers={managers} stageId={scope} />
        )}
      </Box>
    </Box>
  );
}
