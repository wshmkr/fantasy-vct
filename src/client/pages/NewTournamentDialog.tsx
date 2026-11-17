import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import {
  API_ROUTES,
  type CreateTournamentBody,
  type ImportStarted,
} from "@shared/api";
import {
  IMPORT_PHASES,
  type ImportJob,
  type ImportPhase,
} from "@shared/entities";
import { useMutation } from "@tanstack/react-query";
import { Calendar, Shield, User, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../apiClient";
import ErrorLabel from "../components/ErrorLabel";
import EventLogo from "../components/EventLogo";
import Pane from "../components/Pane";
import ProgressBar from "../components/ProgressBar";
import SmallIconButton from "../components/SmallIconButton";
import StageChips from "../components/StageChips";
import { useImportJob, useTournament } from "../tournaments";

const PHASE_ICONS: Record<ImportPhase, typeof Calendar> = {
  event: Calendar,
  teams: Shield,
  players: User,
};

const PHASE_LABELS: Record<ImportPhase, string> = {
  event: "Event",
  teams: "Teams",
  players: "Players and coaches",
};

function ImportProgressRows({ job }: { job: ImportJob | undefined }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {IMPORT_PHASES.map((phase) => {
        const Icon = PHASE_ICONS[phase];
        const progress = job?.progress[phase];
        const isComplete =
          progress !== undefined && progress.done === progress.total;
        return (
          <Box
            key={phase}
            aria-label={PHASE_LABELS[phase]}
            sx={{ display: "flex", alignItems: "center", gap: "12px" }}
          >
            <Box
              sx={[
                {
                  width: 32,
                  height: 32,
                  flex: "none",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "var(--pane)",
                  color: "var(--ink-muted)",
                  opacity: 0.6,
                },
                progress !== undefined && {
                  bgcolor: "var(--pane-hover)",
                  color: "var(--ink)",
                  opacity: 1,
                },
                isComplete && {
                  bgcolor: "var(--accent-soft)",
                  color: "var(--accent-text)",
                },
              ]}
            >
              <Icon size={16} aria-hidden />
            </Box>
            <Box sx={{ flex: 1 }}>
              <ProgressBar
                done={progress?.done ?? 0}
                total={progress?.total ?? 1}
                height={6}
              />
            </Box>
            <Typography
              variant="stat"
              sx={{ width: 52, textAlign: "right", color: "var(--ink-muted)" }}
            >
              {progress ? `${progress.done}/${progress.total}` : "—"}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function ImportedEvent({ tournamentId }: { tournamentId: number }) {
  const tournament = useTournament(tournamentId);
  if (!tournament.data) return null;
  return (
    <Pane sx={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <EventLogo imageId={tournament.data.logoImageId} size={48} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Typography variant="bodyStrong" sx={{ fontSize: 15 }}>
          {tournament.data.name}
        </Typography>
        <StageChips stages={tournament.data.stages} />
      </Box>
    </Pane>
  );
}

export default function NewTournamentDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const [vlrEventUrl, setVlrEventUrl] = useState("");
  const startImport = useMutation({
    mutationFn: (body: CreateTournamentBody) =>
      apiClient.post<ImportStarted>(API_ROUTES.tournaments, body),
  });
  const { job, failure } = useImportJob(startImport.data?.importId ?? null);
  const tournamentId = job?.tournamentId ?? null;
  const importError = startImport.error?.message ?? failure;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (vlrEventUrl.trim()) startImport.mutate({ vlrEventUrl });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="new-tournament-title"
      slotProps={{
        paper: {
          sx: {
            width: "100%",
            maxWidth: 520,
            p: 3,
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="heading" id="new-tournament-title">
          New tournament
        </Typography>
        <SmallIconButton
          label="Close"
          size={32}
          onClick={onClose}
          sx={{ borderRadius: "var(--radius-md)" }}
        >
          <X size={16} />
        </SmallIconButton>
      </Box>

      {startImport.isSuccess && !failure ? (
        <>
          {tournamentId !== null && (
            <ImportedEvent tournamentId={tournamentId} />
          )}
          <ImportProgressRows job={job} />
        </>
      ) : (
        <Box
          component="form"
          onSubmit={submit}
          sx={{ display: "flex", gap: "10px" }}
        >
          <InputBase
            autoFocus
            value={vlrEventUrl}
            onChange={(event) => {
              setVlrEventUrl(event.target.value);
              startImport.reset();
            }}
            placeholder="vlr.gg/event/…"
            inputProps={{ "aria-label": "VLR event link" }}
            error={startImport.isError}
            sx={{ flex: 1 }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={startImport.isPending}
            sx={{ height: 44, px: "18px" }}
          >
            Import
          </Button>
        </Box>
      )}

      <ErrorLabel message={importError} />

      {tournamentId !== null && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            component={Link}
            to={`/tournaments/${tournamentId}/teams`}
            variant="contained"
            sx={{ height: 44, px: "18px" }}
          >
            Open
          </Button>
        </Box>
      )}
    </Dialog>
  );
}
