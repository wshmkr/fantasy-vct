import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { API_ROUTES } from "@shared/api";
import type { PickableKind, PoolPickable, Team } from "@shared/entities";
import { ExternalLink, GraduationCap, User } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import Pane from "../../../components/Pane";
import { CoachBadge } from "../../../components/PlayerChip";
import PlayerPhoto from "../../../components/PlayerPhoto";
import Points from "../../../components/Points";
import SearchField from "../../../components/SearchField";
import SegmentedControl, {
  type Segment,
} from "../../../components/SegmentedControl";
import SortHeader, { type SortColumn } from "../../../components/SortHeader";
import TeamToggles from "../../../components/TeamToggles";
import {
  availablePool,
  defaultPoolSort,
  nextPoolSort,
  type PoolSortKey,
} from "./draftView";
import { shake } from "./motion";

const POOL_GRID = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 48px 44px 40px 40px",
  gap: "8px",
  alignItems: "center",
  px: "8px",
};

const KIND_SEGMENTS: Segment<PickableKind>[] = [
  { key: "player", label: "Players", Icon: User },
  { key: "coach", label: "Coaches", Icon: GraduationCap },
];

const COLUMNS: SortColumn<PoolSortKey>[] = [
  { key: "handle", label: "PLAYER", alignLeft: true },
  { key: "points", label: "PTS" },
  { key: "formRating", label: "RTG" },
  { key: "formAcs", label: "ACS" },
  { key: "formKd", label: "K/D" },
];

function formatStat(value: number | null, digits: number): string {
  return value === null ? "" : value.toFixed(digits);
}

function PoolRow({
  pickable,
  teamLogoImageId,
  isSelected,
  isRejected,
  actionLabel,
  actionDisabled,
  onSelect,
  onAct,
}: {
  pickable: PoolPickable;
  teamLogoImageId: number | null;
  isSelected: boolean;
  isRejected: boolean;
  actionLabel: string | null;
  actionDisabled: boolean;
  onSelect: (() => void) | undefined;
  onAct: () => void;
}) {
  return (
    <Box
      role="option"
      aria-label={pickable.handle}
      aria-selected={isSelected}
      onClick={onSelect}
      sx={[
        {
          ...POOL_GRID,
          flex: "none",
          height: 42,
          borderRadius: "var(--radius-md)",
          transition: "background-color 150ms ease-out",
          "& .vlr-link": { opacity: 0, transition: "opacity 150ms ease-out" },
          "&:hover": { bgcolor: "var(--pane-hover)" },
          "&:hover .vlr-link, & .vlr-link:focus-visible": { opacity: 1 },
        },
        onSelect !== undefined && { cursor: "pointer" },
        isSelected && {
          bgcolor: "color-mix(in srgb, var(--accent) 12%, transparent)",
          boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent)",
          "&:hover": {
            bgcolor: "color-mix(in srgb, var(--accent) 12%, transparent)",
          },
        },
        isRejected && {
          boxShadow: "inset 0 0 0 1px var(--loss)",
          animation: shake,
        },
      ]}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}
      >
        <PlayerPhoto
          photoImageId={pickable.photoImageId}
          teamLogoImageId={teamLogoImageId}
          size={28}
        />
        <Typography variant="bodyStrong" noWrap sx={{ minWidth: 0 }}>
          {pickable.handle}
        </Typography>
        {pickable.kind === "coach" && <CoachBadge />}
        {pickable.topAgents.length > 0 && (
          <Box sx={{ display: "flex", gap: "2px", flex: "none" }}>
            {pickable.topAgents.map((agent) => (
              <Tooltip key={agent.name} title={agent.name}>
                <Box
                  component="img"
                  src={API_ROUTES.image(agent.imageId)}
                  alt={agent.name}
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: "4px",
                    bgcolor: "#ffffff10",
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        )}
        {pickable.vlrUrl && (
          <Tooltip title="Open on VLR">
            <Box
              component="a"
              className="vlr-link"
              href={pickable.vlrUrl}
              target="_blank"
              rel="noopener"
              aria-label="Open on VLR"
              onClick={(event) => event.stopPropagation()}
              sx={{ display: "flex", flex: "none", color: "var(--ink-muted)" }}
            >
              <ExternalLink size={12} />
            </Box>
          </Tooltip>
        )}
        {isSelected && actionLabel && (
          <Button
            variant="contained"
            disabled={actionDisabled}
            onClick={(event) => {
              event.stopPropagation();
              onAct();
            }}
            sx={{
              flex: "none",
              ml: "auto",
              height: 28,
              minWidth: 0,
              px: "12px",
              fontSize: 12,
              borderRadius: "var(--radius-sm)",
              boxShadow: "inset 0 1px 0 #ffffff59",
            }}
          >
            {actionLabel}
          </Button>
        )}
      </Box>
      <Points points={pickable.points} />
      <Typography variant="stat" sx={{ textAlign: "right", fontWeight: 600 }}>
        {formatStat(pickable.formRating, 2)}
      </Typography>
      <Typography
        variant="stat"
        sx={{ textAlign: "right", color: "var(--ink-muted)" }}
      >
        {formatStat(pickable.formAcs, 0)}
      </Typography>
      <Typography
        variant="stat"
        sx={{ textAlign: "right", color: "var(--ink-muted)" }}
      >
        {formatStat(pickable.formKd, 2)}
      </Typography>
    </Box>
  );
}

interface DraftPoolProps {
  pool: PoolPickable[];
  teams: Team[];
  teamLogos: ReadonlyMap<number, number | null>;
  kind: PickableKind;
  onKindChange: (kind: PickableKind) => void;
  actionLabel: string | null;
  actionPending: boolean;
  onAct: (pickable: PoolPickable) => void;
  rowRejectionId: number | null;
}

export default function DraftPool({
  pool,
  teams,
  teamLogos,
  kind,
  onKindChange,
  actionLabel,
  actionPending,
  onAct,
  rowRejectionId,
}: DraftPoolProps) {
  const [search, setSearch] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [sort, setSort] = useState(() => defaultPoolSort(pool));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const rows = availablePool(
    pool,
    teamNames,
    { search, kind, teamIds: selectedTeamIds },
    sort,
  );
  const canAct = actionLabel !== null;
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!canAct) return;
    const selectedRow = rows[selectedIndex];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = selectedRow
        ? Math.min(rows.length - 1, Math.max(0, selectedIndex + step))
        : 0;
      const nextRow = rows[nextIndex];
      if (!nextRow) return;
      setSelectedId(nextRow.id);
      listRef.current?.children[nextIndex]?.scrollIntoView({
        block: "nearest",
      });
    } else if (
      event.key === "Enter" &&
      selectedRow &&
      !actionPending &&
      // Enter on a focused button already clicks it.
      !(event.target as HTMLElement).closest("button, a")
    ) {
      event.preventDefault();
      onAct(selectedRow);
    }
  };

  const toggleTeam = (teamId: number) => {
    const next = new Set(selectedTeamIds);
    if (!next.delete(teamId)) next.add(teamId);
    setSelectedTeamIds(next);
  };

  return (
    <Pane
      dense
      component="section"
      aria-label="Available"
      onKeyDown={handleKeyDown}
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <Box sx={{ display: "flex", gap: "8px" }}>
        <SearchField
          value={search}
          onChange={setSearch}
          ariaLabel="Search players or teams"
        />
        <SegmentedControl
          segments={KIND_SEGMENTS}
          selectedKey={kind}
          onSelect={onKindChange}
          ariaLabel="Kind"
          inPane
          iconOnly
        />
      </Box>
      <TeamToggles
        teams={teams}
        selectedTeamIds={selectedTeamIds}
        onToggle={toggleTeam}
      />
      <Box
        sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <SortHeader
          columns={COLUMNS}
          sort={sort}
          onSort={(key) => setSort(nextPoolSort(sort, key))}
          sx={POOL_GRID}
        />
        <Box
          ref={listRef}
          role="listbox"
          aria-label="Available"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            pt: "4px",
            scrollbarWidth: "thin",
          }}
        >
          {rows.map((pickable) => {
            const isSelected = canAct && pickable.id === selectedId;
            return (
              <PoolRow
                key={
                  isSelected && rowRejectionId !== null
                    ? `${pickable.id}-${rowRejectionId}`
                    : pickable.id
                }
                pickable={pickable}
                teamLogoImageId={teamLogos.get(pickable.teamId) ?? null}
                isSelected={isSelected}
                isRejected={isSelected && rowRejectionId !== null}
                actionLabel={actionLabel}
                actionDisabled={actionPending}
                onSelect={canAct ? () => setSelectedId(pickable.id) : undefined}
                onAct={() => onAct(pickable)}
              />
            );
          })}
        </Box>
      </Box>
    </Pane>
  );
}
