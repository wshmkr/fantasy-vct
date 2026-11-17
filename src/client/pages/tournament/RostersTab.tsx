import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  type DraftSeat,
  displayNameOf,
  isDraftRunning,
  type PoolPickable,
  type Stage,
  type Tournament,
} from "@shared/entities";
import { Lock } from "lucide-react";
import { useState } from "react";
import ManagerAvatar from "../../components/ManagerAvatar";
import Pane from "../../components/Pane";
import PlayerChip from "../../components/PlayerChip";
import SegmentedControl from "../../components/SegmentedControl";
import { useDraft, useDraftStream } from "../../draft";
import { draftLookups, PLAYER_SLOTS, seatRoster } from "./draft/draftView";

const CHIP_HEIGHT = 42;

function defaultRosterStageId(stages: Stage[]): number | undefined {
  const running = stages.find((stage) => isDraftRunning(stage.status));
  const lastComplete = stages.findLast((stage) => stage.status === "complete");
  return (running ?? lastComplete ?? stages[0])?.id;
}

function RosterSlot({
  pickable,
  teamLogos,
}: {
  pickable: PoolPickable | undefined;
  teamLogos: ReadonlyMap<number, number | null>;
}) {
  if (!pickable) {
    return (
      <Box
        sx={{
          height: CHIP_HEIGHT,
          borderRadius: "9px",
          boxShadow: "inset 0 0 0 1px var(--line)",
          opacity: 0.35,
        }}
      />
    );
  }
  return (
    <PlayerChip
      pickable={pickable}
      teamLogoImageId={teamLogos.get(pickable.teamId) ?? null}
    />
  );
}

function RosterCard({
  seat,
  pickablesById,
  teamLogos,
}: {
  seat: DraftSeat;
  pickablesById: ReadonlyMap<number, PoolPickable>;
  teamLogos: ReadonlyMap<number, number | null>;
}) {
  const { players, coach } = seatRoster(seat, pickablesById);
  const color = `var(--${seat.color})`;
  const name = displayNameOf(seat.user);
  return (
    <Pane
      component="section"
      aria-label={name}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${color} 16%, transparent), color-mix(in srgb, ${color} 4%, transparent) 60%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 40%, transparent), var(--shadow-pane)`,
      }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "10px", px: "4px" }}
      >
        <ManagerAvatar user={seat.user} size={30} ringColor={seat.color} />
        <Typography variant="bodyStrong" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Typography>
        {seat.locked && (
          <Tooltip title="Locked">
            <Lock
              size={14}
              color="var(--ink-muted)"
              aria-label="Locked"
              role="img"
            />
          </Tooltip>
        )}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "4px 8px",
        }}
      >
        {PLAYER_SLOTS.map((slot) => (
          <RosterSlot
            key={slot}
            pickable={players[slot]}
            teamLogos={teamLogos}
          />
        ))}
        <RosterSlot pickable={coach} teamLogos={teamLogos} />
      </Box>
    </Pane>
  );
}

function StageRosters({ stageId }: { stageId: number }) {
  const draft = useDraft(stageId).data;
  useDraftStream(stageId);
  if (!draft) return null;
  const { pickablesById, teamLogos } = draftLookups(draft);
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "16px",
      }}
    >
      {draft.seats.map((seat) => (
        <RosterCard
          key={seat.user.id}
          seat={seat}
          pickablesById={pickablesById}
          teamLogos={teamLogos}
        />
      ))}
    </Box>
  );
}

export default function RostersTab({ tournament }: { tournament: Tournament }) {
  const [stageId, setStageId] = useState(() =>
    defaultRosterStageId(tournament.stages),
  );
  if (stageId === undefined) return null;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <SegmentedControl
        segments={tournament.stages.map((stage) => ({
          key: stage.id,
          label: stage.name,
        }))}
        selectedKey={stageId}
        onSelect={setStageId}
        ariaLabel="Stage"
      />
      <StageRosters stageId={stageId} />
    </Box>
  );
}
