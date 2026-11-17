import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import {
  API_ROUTES,
  type UpdatePoolEntryBody,
  type UpdateStageBody,
} from "@shared/api";
import type { Stage, StagePoolEntry, StagePoolTeam } from "@shared/entities";
import { Calendar, Check, Pencil, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../../apiClient";
import ErrorLabel from "../../components/ErrorLabel";
import Pane from "../../components/Pane";
import PlayerChip from "../../components/PlayerChip";
import SectionLabel from "../../components/SectionLabel";
import SmallIconButton from "../../components/SmallIconButton";
import StatChip from "../../components/StatChip";
import TeamLogo from "../../components/TeamLogo";
import { useStagePool, useTournamentMutation } from "../../tournaments";

function StageRow({
  stage,
  selected,
  onSelect,
}: {
  stage: Stage;
  selected: boolean;
  onSelect: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const updateStage = useTournamentMutation((body: UpdateStageBody) =>
    apiClient.patch(API_ROUTES.stage(stage.id), body),
  );
  const deleteStage = useTournamentMutation(() =>
    apiClient.delete(API_ROUTES.stage(stage.id)),
  );
  const editable = stage.status === "setup";

  const finishRename = (name: string) => {
    setRenaming(false);
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== stage.name) {
      updateStage.mutate({ name: trimmedName });
    }
  };

  useEffect(() => {
    if (!confirmingDelete) return;
    // Not every browser focuses a clicked button, so blur alone can't be trusted to disarm.
    const disarm = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(disarm);
  }, [confirmingDelete]);

  return (
    <Box
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 42,
          px: "10px",
          borderRadius: "10px",
          boxShadow: "inset 0 0 0 1px #ffffff0d",
        },
        selected && {
          bgcolor: "#ffffff08",
          boxShadow: "inset 0 0 0 1px #ffffff1f",
        },
      ]}
    >
      {renaming ? (
        <InputBase
          autoFocus
          defaultValue={stage.name}
          inputProps={{ "aria-label": "Stage name" }}
          onBlur={(event) => finishRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.value = stage.name;
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          sx={{ flex: 1, height: 30, px: "8px", fontSize: 14 }}
        />
      ) : (
        <ButtonBase
          aria-pressed={selected}
          onClick={onSelect}
          sx={{
            flex: 1,
            minWidth: 0,
            alignSelf: "stretch",
            justifyContent: "flex-start",
            gap: "10px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <Typography variant="bodyStrong" noWrap>
            {stage.name}
          </Typography>
          <StatChip label="Matches" icon={<Calendar size={12} />}>
            {stage.matchCount}
          </StatChip>
          <StatChip label="In pool" icon={<User size={12} />}>
            {stage.poolSize}
          </StatChip>
        </ButtonBase>
      )}
      <ErrorLabel
        message={updateStage.error?.message ?? deleteStage.error?.message}
      />
      {editable && (
        <>
          <SmallIconButton label="Rename" onClick={() => setRenaming(true)}>
            <Pencil size={13} />
          </SmallIconButton>
          <SmallIconButton
            label={confirmingDelete ? "Confirm delete" : "Delete"}
            disabled={deleteStage.isPending}
            onClick={() =>
              confirmingDelete
                ? deleteStage.mutate(undefined)
                : setConfirmingDelete(true)
            }
            onBlur={() => setConfirmingDelete(false)}
            sx={{ color: "var(--loss)", "&:hover": { color: "var(--loss)" } }}
          >
            {confirmingDelete ? <Check size={13} /> : <Trash2 size={13} />}
          </SmallIconButton>
        </>
      )}
    </Box>
  );
}

export function StagesSection({
  stages,
  selectedStageId,
  onSelect,
  sx,
}: {
  stages: Stage[];
  selectedStageId: number | undefined;
  onSelect: (stageId: number) => void;
  sx?: SxProps<Theme>;
}) {
  return (
    <Pane
      component="section"
      aria-label="Stages"
      sx={[
        { display: "flex", flexDirection: "column", gap: 1 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <SectionLabel>Stages</SectionLabel>
      {stages.map((stage) => (
        <StageRow
          key={stage.id}
          stage={stage}
          selected={stage.id === selectedStageId}
          onSelect={() => onSelect(stage.id)}
        />
      ))}
    </Pane>
  );
}

function PoolTeamCard({
  team,
  editable,
  onToggle,
}: {
  team: StagePoolTeam;
  editable: boolean;
  onToggle: (entry: StagePoolEntry) => void;
}) {
  return (
    <Box
      component="section"
      aria-label={team.name}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        p: 1,
        borderRadius: "10px",
        bgcolor: "var(--pane)",
        boxShadow: "inset 0 0 0 1px var(--pane-edge)",
      }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "8px", px: "4px" }}
      >
        <TeamLogo imageId={team.logoImageId} size={20} />
        <Typography variant="bodyStrong" component="h3" noWrap>
          {team.name}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "2px 4px",
        }}
      >
        {team.pool.map((entry) => (
          <PlayerChip
            key={entry.id}
            pickable={entry}
            teamLogoImageId={team.logoImageId}
            dense
            struckOut={entry.removed}
            {...(editable && {
              onClick: () => onToggle(entry),
              "aria-label": `${entry.removed ? "Restore" : "Remove"} ${entry.handle}`,
            })}
          />
        ))}
      </Box>
    </Box>
  );
}

export function PoolEditor({
  tournamentId,
  stage,
  sx,
}: {
  tournamentId: number;
  stage: Stage;
  sx?: SxProps<Theme>;
}) {
  const pool = useStagePool(tournamentId, stage.id);
  const togglePoolEntry = useTournamentMutation((entry: StagePoolEntry) =>
    apiClient.patch(API_ROUTES.stagePoolEntry(stage.id, entry.id), {
      removed: !entry.removed,
    } satisfies UpdatePoolEntryBody),
  );

  return (
    <Pane
      dense
      component="section"
      aria-label={`${stage.name} pool`}
      sx={[
        { display: "flex", flexDirection: "column", gap: 1 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <ErrorLabel message={togglePoolEntry.error?.message} />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        {pool.data?.map((team) => (
          <PoolTeamCard
            key={team.id}
            team={team}
            editable={stage.status === "setup"}
            onToggle={(entry) => {
              // The toggle is computed from cached data, so wait for the refetch before the next one.
              if (!togglePoolEntry.isPending) togglePoolEntry.mutate(entry);
            }}
          />
        ))}
      </Box>
    </Pane>
  );
}
