import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  type DraftControl,
  type DraftSeat,
  type DraftState,
  displayNameOf,
  isDraftRunning,
  type Stage,
} from "@shared/entities";
import { DRAFT_ROUNDS } from "@shared/snake";
import {
  ArrowLeftRight,
  Check,
  Pause,
  Play,
  Shuffle,
  Undo2,
  UserCheck,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import ErrorLabel from "../../../components/ErrorLabel";
import ManagerAvatar from "../../../components/ManagerAvatar";
import SmallIconButton from "../../../components/SmallIconButton";
import { formatClock } from "./draftView";
import {
  avatarBreathingGlow,
  avatarGlow,
  avatarUrgentGlow,
  shake,
} from "./motion";
import { FINAL_SECONDS } from "./useSecondsLeft";

const CONTROL_SIZE = 32;

export function StagePills({
  stages,
  selectedStageId,
  onSelect,
}: {
  stages: Stage[];
  selectedStageId: number;
  onSelect: (stageId: number) => void;
}) {
  return (
    <Box
      role="tablist"
      aria-label="Stage"
      sx={{
        display: "inline-flex",
        flex: "none",
        gap: "3px",
        p: "3px",
        borderRadius: "var(--radius-md)",
        bgcolor: "#00000033",
        boxShadow: "inset 0 0 0 1px #ffffff12",
      }}
    >
      {stages.map((stage) => {
        const isSelected = stage.id === selectedStageId;
        return (
          <Box
            key={stage.id}
            component="button"
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(stage.id)}
            sx={[
              {
                px: "11px",
                py: "5px",
                border: 0,
                borderRadius: "7px",
                font: "inherit",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink-muted)",
                bgcolor: "transparent",
                cursor: "pointer",
                transition: "background-color 150ms ease-out, color 150ms",
                "&:hover": { color: "var(--ink)" },
              },
              isSelected && {
                color: "var(--ink)",
                bgcolor: "#ffffff17",
                boxShadow:
                  "inset 1px 1px 0 #ffffff47, inset 0 0 0 1px #ffffff1a, 0 4px 12px #00000066",
              },
            ]}
          >
            {stage.name}
          </Box>
        );
      })}
    </Box>
  );
}

export function GlowingAvatar({
  seat,
  size,
  secondsLeft,
}: {
  seat: DraftSeat;
  size: number;
  secondsLeft: number | null;
}) {
  const isTicking = secondsLeft !== null;
  return (
    <Box
      sx={[
        { borderRadius: "50%", flex: "none", width: size, height: size },
        isTicking && {
          boxShadow: avatarGlow,
          animation:
            secondsLeft <= FINAL_SECONDS
              ? avatarUrgentGlow
              : avatarBreathingGlow,
        },
      ]}
    >
      <ManagerAvatar user={seat.user} size={size} ringColor={seat.color} />
    </Box>
  );
}

export function OnTheClock({
  seat,
  secondsLeft,
  isActorsTurn,
}: {
  seat: DraftSeat;
  secondsLeft: number | null;
  isActorsTurn: boolean;
}) {
  const isFinalSeconds = secondsLeft !== null && secondsLeft <= FINAL_SECONDS;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <Tooltip title={displayNameOf(seat.user)}>
        <Box aria-label="On the clock" role="img">
          <GlowingAvatar seat={seat} size={30} secondsLeft={secondsLeft} />
        </Box>
      </Tooltip>
      {secondsLeft === null ? (
        <Tooltip title="Paused">
          <Pause
            size={20}
            color="var(--ink-muted)"
            aria-label="Paused"
            role="img"
          />
        </Tooltip>
      ) : (
        <Typography
          variant="stat"
          role="timer"
          aria-label="Time left"
          sx={{
            minWidth: 52,
            fontSize: 22,
            lineHeight: "28px",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: isFinalSeconds
              ? "var(--accent-text)"
              : isActorsTurn
                ? "var(--ink)"
                : "var(--ink-muted)",
          }}
        >
          {formatClock(secondsLeft)}
        </Typography>
      )}
    </Box>
  );
}

export function CompleteBadge() {
  return (
    <Tooltip title="Complete">
      <Box
        role="img"
        aria-label="Complete"
        sx={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
          bgcolor: "var(--accent-soft)",
          boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)",
        }}
      >
        <Check size={16} strokeWidth={2.4} />
      </Box>
    </Tooltip>
  );
}

export function PhaseDots({
  draft,
}: {
  draft: Pick<DraftState, "status" | "phase" | "round">;
}) {
  const hasStarted = draft.status !== "setup";
  const isSwapping = draft.phase === "swap" || draft.status === "complete";
  const roundDots = Array.from({ length: DRAFT_ROUNDS }, (_, round) => round);
  return (
    <Box
      role="img"
      aria-label={isSwapping ? "Swap phase" : `Round ${draft.round + 1}`}
      sx={{ display: "flex", alignItems: "center", gap: "5px" }}
    >
      {roundDots.map((round) => {
        const isDone = isSwapping || (hasStarted && round < draft.round);
        const isCurrent = hasStarted && !isSwapping && round === draft.round;
        return (
          <Box
            key={round}
            sx={[
              {
                width: 7,
                height: 7,
                borderRadius: "50%",
                bgcolor: "#ffffff1f",
              },
              isDone && { bgcolor: "var(--accent)" },
              isCurrent && {
                bgcolor: "transparent",
                boxShadow: "inset 0 0 0 2px var(--accent)",
              },
            ]}
          />
        );
      })}
      <Box
        sx={[
          {
            width: 18,
            height: 18,
            ml: "3px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-muted)",
            boxShadow: "inset 0 0 0 1.5px #ffffff26",
          },
          isSwapping && {
            color: "var(--on-accent)",
            bgcolor: "var(--accent)",
            boxShadow: "none",
          },
        ]}
      >
        <ArrowLeftRight size={11} strokeWidth={2.6} aria-hidden />
      </Box>
    </Box>
  );
}

export interface Rejection {
  id: number;
  message: string;
  fromPoolRow: boolean;
}

export function RejectionLabel({ rejection }: { rejection: Rejection }) {
  return (
    <Box
      sx={{
        flex: "none",
        px: "10px",
        py: "4px",
        borderRadius: "var(--radius-full)",
        boxShadow: "inset 0 0 0 1px var(--loss)",
        animation: shake,
      }}
    >
      <ErrorLabel message={rejection.message} />
    </Box>
  );
}

export function PrimaryAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="contained"
      startIcon={icon}
      disabled={disabled}
      onClick={onClick}
      sx={{
        flex: "none",
        height: CONTROL_SIZE,
        px: "14px",
        fontSize: 13,
        boxShadow:
          "inset 0 1px 0 #ffffff59, 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent)",
      }}
    >
      {label}
    </Button>
  );
}

function ActAsMenu({
  seats,
  actingAsUserId,
  onChange,
}: {
  seats: DraftSeat[];
  actingAsUserId: number | null;
  onChange: (userId: number | null) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const actingAs = seats.find((seat) => seat.user.id === actingAsUserId);
  return (
    <>
      <SmallIconButton
        label={
          actingAs
            ? `Acting as ${displayNameOf(actingAs.user)}`
            : "Act as manager"
        }
        size={CONTROL_SIZE}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={
          actingAs && {
            bgcolor: "var(--accent-soft)",
            boxShadow: "var(--shadow-glow)",
          }
        }
      >
        {actingAs ? (
          <ManagerAvatar
            user={actingAs.user}
            size={20}
            ringColor={actingAs.color}
          />
        ) : (
          <UserCheck size={15} />
        )}
      </SmallIconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {seats.map((seat) => {
          const isActingAs = seat.user.id === actingAsUserId;
          return (
            <MenuItem
              key={seat.user.id}
              selected={isActingAs}
              onClick={() => {
                onChange(isActingAs ? null : seat.user.id);
                setAnchor(null);
              }}
              sx={{ gap: "4px", fontSize: 14, fontWeight: 600 }}
            >
              <ListItemIcon>
                <ManagerAvatar
                  user={seat.user}
                  size={22}
                  ringColor={seat.color}
                />
              </ListItemIcon>
              {displayNameOf(seat.user)}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

export function CommissionerControls({
  draft,
  onControl,
  disabled,
  actingAsUserId,
  onActingAsChange,
}: {
  draft: DraftState;
  onControl: (control: DraftControl) => void;
  disabled: boolean;
  actingAsUserId: number | null;
  onActingAsChange: (userId: number | null) => void;
}) {
  return (
    <Box
      role="toolbar"
      aria-label="Commissioner"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        pl: "10px",
        borderLeft: "1px solid #ffffff14",
      }}
    >
      {draft.status === "setup" ? (
        <>
          <SmallIconButton
            label="Shuffle seats"
            size={CONTROL_SIZE}
            disabled={disabled}
            onClick={() => onControl("shuffle")}
          >
            <Shuffle size={15} />
          </SmallIconButton>
          <PrimaryAction
            label="Start"
            disabled={disabled}
            onClick={() => onControl("start")}
          />
        </>
      ) : (
        <>
          {draft.status === "drafting" && (
            <SmallIconButton
              label="Pause"
              size={CONTROL_SIZE}
              disabled={disabled}
              onClick={() => onControl("pause")}
            >
              <Pause size={15} />
            </SmallIconButton>
          )}
          {draft.status === "paused" && (
            <SmallIconButton
              label="Resume"
              size={CONTROL_SIZE}
              disabled={disabled}
              onClick={() => onControl("resume")}
            >
              <Play size={15} />
            </SmallIconButton>
          )}
          <SmallIconButton
            label="Undo"
            size={CONTROL_SIZE}
            disabled={disabled || draft.recentActions.length === 0}
            onClick={() => onControl("undo")}
          >
            <Undo2 size={15} />
          </SmallIconButton>
          {isDraftRunning(draft.status) && (
            <ActAsMenu
              seats={draft.seats}
              actingAsUserId={actingAsUserId}
              onChange={onActingAsChange}
            />
          )}
        </>
      )}
    </Box>
  );
}
