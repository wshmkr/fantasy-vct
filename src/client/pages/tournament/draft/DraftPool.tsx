import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { API_ROUTES } from "@shared/api";
import type { PickableKind, PoolPickable, Team } from "@shared/entities";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GraduationCap,
  Search,
  User,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import Pane from "../../../components/Pane";
import { CoachBadge } from "../../../components/PlayerChip";
import PlayerPhoto from "../../../components/PlayerPhoto";
import SegmentedControl, {
  type Segment,
} from "../../../components/SegmentedControl";
import TeamLogo from "../../../components/TeamLogo";
import {
  availablePool,
  DEFAULT_POOL_SORT,
  nextPoolSort,
  type PoolSort,
  type PoolSortKey,
} from "./draftView";
import { shake } from "./motion";

const POOL_GRID = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 44px 40px 40px",
  gap: "8px",
  alignItems: "center",
  px: "8px",
};

const KIND_SEGMENTS: Segment<PickableKind>[] = [
  { key: "player", label: "Players", Icon: User },
  { key: "coach", label: "Coaches", Icon: GraduationCap },
];

const COLUMNS: { key: PoolSortKey; label: string }[] = [
  { key: "handle", label: "PLAYER" },
  { key: "formRating", label: "RTG" },
  { key: "formAcs", label: "ACS" },
  { key: "formKd", label: "K/D" },
];

function formatStat(value: number | null, digits: number): string {
  return value === null ? "" : value.toFixed(digits);
}

function TeamToggles({
  teams,
  selectedTeamIds,
  onToggle,
}: {
  teams: Team[];
  selectedTeamIds: ReadonlySet<number>;
  onToggle: (teamId: number) => void;
}) {
  return (
    <Box
      role="group"
      aria-label="Teams"
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(teams.length, 8)}, minmax(0, 1fr))`,
        gap: "4px",
      }}
    >
      {teams.map((team) => {
        const isSelected = selectedTeamIds.has(team.id);
        return (
          <Tooltip key={team.id} title={team.name}>
            <ButtonBase
              aria-label={team.name}
              aria-pressed={isSelected}
              onClick={() => onToggle(team.id)}
              sx={[
                {
                  height: 30,
                  borderRadius: "var(--radius-sm)",
                  bgcolor: "#ffffff08",
                  boxShadow: "inset 0 0 0 1px var(--pane-edge)",
                  opacity: selectedTeamIds.size > 0 ? 0.55 : 1,
                  transition: "opacity 150ms ease-out, background-color 150ms",
                  "&:hover": { opacity: 1 },
                },
                isSelected && {
                  opacity: 1,
                  bgcolor: "#ffffff1f",
                  boxShadow: "inset 0 0 0 1px var(--pane-highlight)",
                },
              ]}
            >
              <TeamLogo imageId={team.logoImageId} size={18} />
            </ButtonBase>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function SortHeader({
  sort,
  onSort,
}: {
  sort: PoolSort;
  onSort: (key: PoolSortKey) => void;
}) {
  return (
    <Box
      sx={{
        ...POOL_GRID,
        pb: "8px",
        borderBottom: "1px solid var(--pane-edge)",
      }}
    >
      {COLUMNS.map((column) => {
        const isSorted = column.key === sort.key;
        const Arrow = sort.descending ? ChevronDown : ChevronUp;
        return (
          <ButtonBase
            key={column.key}
            aria-sort={
              isSorted ? (sort.descending ? "descending" : "ascending") : "none"
            }
            onClick={() => onSort(column.key)}
            sx={[
              {
                justifyContent:
                  column.key === "handle" ? "flex-start" : "flex-end",
                gap: "2px",
                color: "var(--ink-muted)",
                "&:hover": { color: "var(--ink)" },
              },
              isSorted && { color: "var(--accent-text)" },
            ]}
          >
            <Typography
              variant="label"
              sx={{ fontWeight: 600, letterSpacing: "0.05em" }}
            >
              {column.label}
            </Typography>
            {isSorted && <Arrow size={12} aria-hidden />}
          </ButtonBase>
        );
      })}
    </Box>
  );
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
  const [sort, setSort] = useState(DEFAULT_POOL_SORT);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.closest("input, textarea")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

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
        <InputBase
          inputRef={searchRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          inputProps={{ "aria-label": "Search players or teams" }}
          startAdornment={
            <Search
              size={14}
              color="var(--ink-muted)"
              aria-hidden
              style={{ marginRight: 8, flex: "none" }}
            />
          }
          endAdornment={
            <Typography
              component="kbd"
              variant="stat"
              sx={{
                px: "5px",
                fontSize: 10,
                lineHeight: "16px",
                color: "var(--ink-muted)",
                borderRadius: "4px",
                boxShadow: "inset 0 0 0 1px #ffffff26",
              }}
            >
              /
            </Typography>
          }
          sx={{ flex: 1, minWidth: 0, height: 34, px: "10px", fontSize: 13 }}
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
          sort={sort}
          onSort={(key) => setSort(nextPoolSort(sort, key))}
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
