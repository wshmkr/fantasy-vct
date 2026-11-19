import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import type { MatchSummary } from "@shared/api";
import type { Tournament } from "@shared/entities";
import { CloudDownload } from "lucide-react";
import { useState } from "react";
import SegmentedControl from "../../../components/SegmentedControl";
import SmallIconButton from "../../../components/SmallIconButton";
import { useSync, useTournamentMatches } from "../../../matches";
import { useMe } from "../../../useMe";
import MatchDetailPanel from "./MatchDetailPanel";
import {
  defaultMatchesStageId,
  isSelectable,
  latestCompletedMatch,
  scheduleDays,
} from "./matchView";
import ScheduleList from "./ScheduleList";

function SyncButton({ tournamentId }: { tournamentId: number }) {
  const sync = useSync(tournamentId);
  return (
    <SmallIconButton
      label="Sync results"
      size={36}
      disabled={sync.running}
      onClick={sync.start}
      sx={{
        borderRadius: "var(--radius-md)",
        color: "var(--ink)",
        "&.Mui-disabled": { bgcolor: "var(--pane)", color: "var(--ink-muted)" },
      }}
    >
      {sync.running ? (
        <CircularProgress size={16} color="inherit" aria-label="Syncing" />
      ) : (
        <CloudDownload size={17} aria-hidden />
      )}
    </SmallIconButton>
  );
}

function StageMatches({
  tournament,
  matches,
  isCommissioner,
}: {
  tournament: Tournament;
  matches: MatchSummary[];
  isCommissioner: boolean;
}) {
  const [pickedMatchId, setPickedMatchId] = useState<number>();
  const pickedMatch = matches.find(
    (match) => match.id === pickedMatchId && isSelectable(match),
  );
  const selectedMatchId = (pickedMatch ?? latestCompletedMatch(matches))?.id;
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "20px",
      }}
    >
      <ScheduleList
        days={scheduleDays(matches)}
        selectedMatchId={selectedMatchId}
        onSelect={setPickedMatchId}
        members={tournament.members}
        isCommissioner={isCommissioner}
      />
      {selectedMatchId !== undefined && (
        <MatchDetailPanel
          tournamentId={tournament.id}
          matchId={selectedMatchId}
          members={tournament.members}
          isCommissioner={isCommissioner}
        />
      )}
    </Box>
  );
}

export default function MatchesTab({ tournament }: { tournament: Tournament }) {
  const isCommissioner = useMe().data?.role === "commissioner";
  const matches = useTournamentMatches(tournament.id).data?.matches;
  const [pickedStageId, setPickedStageId] = useState<number>();
  if (!matches) return null;
  const stageId =
    pickedStageId ?? defaultMatchesStageId(tournament.stages, matches);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {stageId !== undefined && (
          <SegmentedControl
            segments={tournament.stages.map((stage) => ({
              key: stage.id,
              label: stage.name,
            }))}
            selectedKey={stageId}
            onSelect={setPickedStageId}
            ariaLabel="Stage"
          />
        )}
        <Box sx={{ flex: 1 }} />
        {isCommissioner && <SyncButton tournamentId={tournament.id} />}
      </Box>
      <StageMatches
        key={stageId}
        tournament={tournament}
        matches={matches.filter((match) => match.stageId === stageId)}
        isCommissioner={isCommissioner}
      />
    </Box>
  );
}
