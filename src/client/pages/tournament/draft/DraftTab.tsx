import Box from "@mui/material/Box";
import type { DraftActionBody } from "@shared/api";
import {
  type DraftState,
  hasRoomFor,
  isDraftRunning,
  isRosterFull,
  type Pickable,
  type PickableKind,
  type PoolPickable,
  type Stage,
  type Tournament,
  type User,
} from "@shared/entities";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import Pane from "../../../components/Pane";
import SegmentedControl from "../../../components/SegmentedControl";
import { useDraft, useDraftCommand, useDraftStream } from "../../../draft";
import { useInvalidateTournaments } from "../../../tournaments";
import { useMe } from "../../../useMe";
import {
  CommissionerControls,
  CompleteBadge,
  OnTheClock,
  PrimaryAction,
  RejectionLabel,
} from "./ClockBar";
import DraftBoard from "./DraftBoard";
import DraftPool from "./DraftPool";
import { draftLookups } from "./draftView";
import RecentActions from "./RecentActions";
import { useSecondsLeft } from "./useSecondsLeft";

const REJECTION_MS = 3000;
// Tall enough for about eight pool rows even when few managers make the board short.
const MIN_POOL_HEIGHT = 470;

function defaultDraftStageId(stages: Stage[]): number | undefined {
  const live = stages.find((stage) => isDraftRunning(stage.status));
  const upcoming = stages.find((stage) => stage.status === "setup");
  return (live ?? upcoming ?? stages[0])?.id;
}

export default function DraftTab({ tournament }: { tournament: Tournament }) {
  const me = useMe();
  const [stageId, setStageId] = useState(() =>
    defaultDraftStageId(tournament.stages),
  );
  if (stageId === undefined || !me.data) return null;
  return (
    <DraftRoom
      key={stageId}
      tournamentId={tournament.id}
      me={me.data}
      stages={tournament.stages}
      stageId={stageId}
      onStageChange={setStageId}
    />
  );
}

function OnTheClockTimer({
  draft,
  receivedAt,
  actorUserId,
}: {
  draft: DraftState;
  receivedAt: number;
  actorUserId: number;
}) {
  const secondsLeft = useSecondsLeft(draft, receivedAt);
  const seat = draft.seats.find((s) => s.seat === draft.currentSeat);
  if (!seat) return null;
  return (
    <OnTheClock
      seat={seat}
      secondsLeft={secondsLeft}
      isActorsTurn={seat.user.id === actorUserId}
    />
  );
}

function DraftRoom({
  tournamentId,
  me,
  stages,
  stageId,
  onStageChange,
}: {
  tournamentId: number;
  me: User;
  stages: Stage[];
  stageId: number;
  onStageChange: (stageId: number) => void;
}) {
  const draftQuery = useDraft(stageId);
  useDraftStream(tournamentId, stageId);
  const invalidateTournaments = useInvalidateTournaments();
  const [actingAsUserId, setActingAsUserId] = useState<number | null>(null);
  const [swapOutId, setSwapOutId] = useState<number | null>(null);
  const [kind, setKind] = useState<PickableKind>("player");
  const command = useDraftCommand(stageId);
  const rejection =
    command.isError && command.variables
      ? {
          id: command.submittedAt,
          message: command.error.message,
          fromPoolRow:
            "action" in command.variables &&
            command.variables.action.action !== "lock",
        }
      : null;

  const status = draftQuery.data?.status;
  useEffect(() => {
    // Starting and finishing a draft change the stage and tournament badges.
    if (status) invalidateTournaments();
  }, [status, invalidateTournaments]);

  const rejectionId = rejection?.id;
  const { reset } = command;
  useEffect(() => {
    if (rejectionId === undefined) return;
    const clear = setTimeout(reset, REJECTION_MS);
    return () => clearTimeout(clear);
  }, [rejectionId, reset]);

  const draft = draftQuery.data;
  if (!draft) return null;

  const isCommissioner = me.role === "commissioner";
  const actorUserId = actingAsUserId ?? me.id;
  const actorSeat = draft.seats.find((seat) => seat.user.id === actorUserId);
  const isActorsTurn =
    draft.status === "drafting" &&
    actorSeat !== undefined &&
    actorSeat.seat === draft.currentSeat;
  const { pickablesById, teamLogos } = draftLookups(draft);
  const actorKinds = (actorSeat?.rosterPickableIds ?? []).flatMap(
    (id) => pickablesById.get(id)?.kind ?? [],
  );
  const canPick = isActorsTurn && hasRoomFor(actorKinds, kind);
  const canLock =
    draft.status === "drafting" &&
    actorSeat !== undefined &&
    !actorSeat.locked &&
    isRosterFull(actorKinds);
  const selectedSwapOutId =
    isActorsTurn &&
    swapOutId !== null &&
    actorSeat.rosterPickableIds.includes(swapOutId)
      ? swapOutId
      : null;

  const onBehalfOf = actingAsUserId ?? undefined;

  const act = (action: DraftActionBody) =>
    command.mutate({ action: { ...action, onBehalfOf } });
  const actOnPoolRow = (pickable: PoolPickable) => {
    if (selectedSwapOutId !== null) {
      act({
        action: "swap",
        pickableOutId: selectedSwapOutId,
        pickableInId: pickable.id,
      });
    } else if (canPick) act({ action: "pick", pickableId: pickable.id });
  };
  const selectSwapOut = (pickable: Pickable) => {
    setSwapOutId(pickable.id === selectedSwapOutId ? null : pickable.id);
    setKind(pickable.kind);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Pane
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "18px",
          py: "10px",
          minHeight: 56,
        }}
      >
        <SegmentedControl
          segments={stages.map((stage) => ({
            key: stage.id,
            label: stage.name,
          }))}
          selectedKey={stageId}
          onSelect={onStageChange}
          ariaLabel="Stage"
          inPane
        />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "18px",
          }}
        >
          {draft.status === "complete" ? (
            <CompleteBadge />
          ) : (
            <OnTheClockTimer
              draft={draft}
              receivedAt={draftQuery.dataUpdatedAt}
              actorUserId={actorUserId}
            />
          )}
        </Box>
        {rejection && (
          <RejectionLabel key={rejection.id} rejection={rejection} />
        )}
        {canLock && (
          <PrimaryAction
            label="Lock"
            icon={<Lock size={15} />}
            disabled={command.isPending}
            onClick={() => act({ action: "lock" })}
          />
        )}
        {isCommissioner && (
          <CommissionerControls
            draft={draft}
            disabled={command.isPending}
            onControl={(control) => command.mutate({ control })}
            actingAsUserId={actingAsUserId}
            onActingAsChange={setActingAsUserId}
          />
        )}
      </Pane>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "7fr 5fr",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <DraftBoard
          draft={draft}
          receivedAt={draftQuery.dataUpdatedAt}
          pickablesById={pickablesById}
          teamLogos={teamLogos}
          swapperUserId={isActorsTurn ? actorUserId : null}
          swapOutId={selectedSwapOutId}
          onSwapOutSelect={selectSwapOut}
        />
        {/* The pool scrolls inside whatever height the board sets, so the room fits one screen. */}
        <Box
          sx={{
            position: "relative",
            alignSelf: "stretch",
            minHeight: MIN_POOL_HEIGHT,
          }}
        >
          <DraftPool
            pool={draft.pool}
            teams={draft.teams}
            teamLogos={teamLogos}
            kind={kind}
            onKindChange={setKind}
            actionLabel={
              selectedSwapOutId !== null ? "Swap" : canPick ? "Pick" : null
            }
            actionPending={command.isPending}
            onAct={actOnPoolRow}
            rowRejectionId={rejection?.fromPoolRow ? rejection.id : null}
          />
        </Box>
      </Box>
      <RecentActions
        actions={draft.recentActions}
        seats={draft.seats}
        pickablesById={pickablesById}
      />
    </Box>
  );
}
