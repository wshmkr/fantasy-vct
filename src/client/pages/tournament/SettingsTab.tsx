import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import { keyframes } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  API_ROUTES,
  type ConnectDiscordBody,
  type DiscordConnectionResult,
  type ImportStarted,
  type UpdateTournamentBody,
} from "@shared/api";
import {
  displayNameOf,
  MAX_MANAGERS,
  MAX_PICK_SECONDS,
  MIN_PICK_SECONDS,
  type Tournament,
  type TournamentMember,
} from "@shared/entities";
import { useMutation } from "@tanstack/react-query";
import { Lock, LockOpen, Minus, Plus, RefreshCw, Timer, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../apiClient";
import ErrorLabel from "../../components/ErrorLabel";
import ManagerAvatar from "../../components/ManagerAvatar";
import Pane from "../../components/Pane";
import SectionLabel from "../../components/SectionLabel";
import SmallIconButton from "../../components/SmallIconButton";
import { useImportJob, useTournamentMutation } from "../../tournaments";
import { PoolEditor, StagesSection } from "./StagesSection";

const PICK_SECONDS_STEP = 15;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

function useUpdateTournament(tournamentId: number) {
  return useTournamentMutation((body: UpdateTournamentBody) =>
    apiClient.patch(API_ROUTES.tournament(tournamentId), body),
  );
}

function ManagerSlot({
  tournamentId,
  member,
}: {
  tournamentId: number;
  member: TournamentMember;
}) {
  const removeManager = useTournamentMutation(() =>
    apiClient.delete(API_ROUTES.tournamentMember(tournamentId, member.user.id)),
  );
  const name = displayNameOf(member.user);
  return (
    <Box
      sx={{
        position: "relative",
        "&:hover .remove-manager, &:focus-within .remove-manager": {
          opacity: 1,
        },
      }}
    >
      <Tooltip title={name}>
        <Box>
          <ManagerAvatar
            user={member.user}
            size={32}
            ringColor={member.color}
          />
        </Box>
      </Tooltip>
      <Tooltip title="Remove">
        <IconButton
          className="remove-manager"
          aria-label={`Remove ${name}`}
          disabled={removeManager.isPending}
          onClick={() => removeManager.mutate(undefined)}
          sx={[
            {
              position: "absolute",
              top: -8,
              right: -8,
              width: 18,
              height: 18,
              p: 0,
              opacity: 0,
              bgcolor: "var(--neutral-badge)",
              color: "var(--loss)",
              transition: "opacity 150ms ease-out",
              "&:hover": { bgcolor: "var(--neutral-badge)" },
            },
            removeManager.isError && { opacity: 1 },
          ]}
        >
          <X size={12} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function ManagersSection({ tournament }: { tournament: Tournament }) {
  const updateTournament = useUpdateTournament(tournament.id);
  const joiningLabel = tournament.joiningOpen
    ? "Close joining"
    : "Open joining";
  return (
    <Pane
      component="section"
      aria-label="Managers"
      sx={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <SectionLabel sx={{ flex: 1 }}>Managers</SectionLabel>
        <ErrorLabel message={updateTournament.error?.message} />
        <Typography variant="stat" sx={{ color: "var(--ink-muted)" }}>
          {tournament.members.length}/{MAX_MANAGERS}
        </Typography>
        <SmallIconButton
          label={joiningLabel}
          aria-pressed={!tournament.joiningOpen}
          disabled={updateTournament.isPending}
          onClick={() =>
            updateTournament.mutate({ joiningOpen: !tournament.joiningOpen })
          }
          sx={
            tournament.joiningOpen
              ? {}
              : {
                  color: "var(--accent)",
                  bgcolor: "color-mix(in srgb, var(--accent) 12%, transparent)",
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in srgb, var(--accent) 33%, transparent)",
                }
          }
        >
          {tournament.joiningOpen ? <LockOpen size={14} /> : <Lock size={14} />}
        </SmallIconButton>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${MAX_MANAGERS}, minmax(0, 1fr))`,
          gap: "6px",
          justifyItems: "center",
          minHeight: 36,
          alignItems: "center",
        }}
      >
        {tournament.members.map((member) => (
          <ManagerSlot
            key={member.user.id}
            tournamentId={tournament.id}
            member={member}
          />
        ))}
      </Box>
    </Pane>
  );
}

function ReimportButton({ tournamentId }: { tournamentId: number }) {
  const startReimport = useMutation({
    mutationFn: () =>
      apiClient.post<ImportStarted>(
        API_ROUTES.tournamentReimport(tournamentId),
      ),
  });
  const { job, failure } = useImportJob(startReimport.data?.importId ?? null);
  const isFinished = Boolean(job?.tournamentId || failure);
  const isRunning =
    startReimport.isPending || (startReimport.isSuccess && !isFinished);

  return (
    <>
      <ErrorLabel message={startReimport.error?.message ?? failure} />
      <SmallIconButton
        label="Re-import from VLR"
        disabled={isRunning}
        onClick={() => startReimport.mutate()}
      >
        <Box
          component="span"
          sx={[
            { display: "flex" },
            isRunning && { animation: `${spin} 1s linear infinite` },
          ]}
        >
          <RefreshCw size={14} />
        </Box>
      </SmallIconButton>
    </>
  );
}

function DraftSection({ tournament }: { tournament: Tournament }) {
  const updateTournament = useUpdateTournament(tournament.id);
  const setupStage = tournament.stages.find(
    (stage) => stage.status === "setup",
  );
  const pickSeconds =
    setupStage?.pickSeconds ?? tournament.stages[0]?.pickSeconds;
  const changePickSeconds = (delta: number) => {
    if (pickSeconds === undefined) return;
    updateTournament.mutate({
      pickSeconds: Math.min(
        MAX_PICK_SECONDS,
        Math.max(MIN_PICK_SECONDS, pickSeconds + delta),
      ),
    });
  };
  const timerLocked = !setupStage || updateTournament.isPending;

  return (
    <Pane
      component="section"
      aria-label="Draft"
      sx={{ display: "flex", alignItems: "center", gap: 1 }}
    >
      <Tooltip title="Pick timer">
        <Box sx={{ display: "flex", color: "var(--ink-muted)" }}>
          <Timer size={16} aria-label="Pick timer" />
        </Box>
      </Tooltip>
      <SmallIconButton
        label="Less time"
        disabled={timerLocked}
        onClick={() => changePickSeconds(-PICK_SECONDS_STEP)}
      >
        <Minus size={14} />
      </SmallIconButton>
      <Typography
        variant="stat"
        sx={{
          minWidth: 52,
          textAlign: "center",
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {pickSeconds}s
      </Typography>
      <SmallIconButton
        label="More time"
        disabled={timerLocked}
        onClick={() => changePickSeconds(PICK_SECONDS_STEP)}
      >
        <Plus size={14} />
      </SmallIconButton>
      <Box sx={{ flex: 1 }} />
      <ReimportButton tournamentId={tournament.id} />
    </Pane>
  );
}

function DiscordSection({ tournament }: { tournament: Tournament }) {
  const [channelId, setChannelId] = useState(tournament.discordChannelId ?? "");
  const connect = useTournamentMutation((body: ConnectDiscordBody) =>
    apiClient.put<DiscordConnectionResult>(
      API_ROUTES.tournamentDiscord(tournament.id),
      body,
    ),
  );
  const managersWithoutRole = connect.data?.managersWithoutRole ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (channelId.trim()) connect.mutate({ channelId });
  }

  return (
    <Pane
      component="section"
      aria-label="Discord"
      sx={{ display: "flex", flexDirection: "column", gap: "10px" }}
    >
      <SectionLabel>Discord</SectionLabel>
      <Box
        component="form"
        onSubmit={submit}
        sx={{ display: "flex", gap: "8px" }}
      >
        <InputBase
          value={channelId}
          onChange={(event) => {
            setChannelId(event.target.value);
            connect.reset();
          }}
          placeholder="Channel ID"
          inputProps={{ "aria-label": "Discord channel ID" }}
          error={connect.isError}
          sx={{ flex: 1, minWidth: 0, height: 38, fontSize: 13 }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={connect.isPending}
          sx={{ height: 38, px: "14px" }}
        >
          {tournament.discordChannelId ? "Reconnect" : "Connect"}
        </Button>
      </Box>
      <ErrorLabel message={connect.error?.message} />
      {connect.isSuccess && (
        <Typography
          variant="body"
          sx={{ fontSize: 12, color: "var(--ink-muted)" }}
        >
          {managersWithoutRole.length === 0
            ? "Role given to every manager."
            : `Couldn't give the role to ${managersWithoutRole.join(", ")}. Are they in the server?`}
        </Typography>
      )}
    </Pane>
  );
}

export default function SettingsTab({
  tournament,
}: {
  tournament: Tournament;
}) {
  const [selectedStageId, setSelectedStageId] = useState<number>();
  const selectedStage =
    tournament.stages.find((stage) => stage.id === selectedStageId) ??
    tournament.stages[0];
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "16px",
        alignItems: "start",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <ManagersSection tournament={tournament} />
        <DraftSection tournament={tournament} />
        <DiscordSection tournament={tournament} />
      </Box>
      <StagesSection
        stages={tournament.stages}
        selectedStageId={selectedStage?.id}
        onSelect={setSelectedStageId}
        sx={{ gridColumn: "span 2" }}
      />
      {selectedStage && (
        <PoolEditor
          tournamentId={tournament.id}
          stage={selectedStage}
          sx={{ gridColumn: "1 / -1" }}
        />
      )}
    </Box>
  );
}
