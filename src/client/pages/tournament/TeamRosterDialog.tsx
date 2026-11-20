import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import type { PickableKind, TeamWithPickables } from "@shared/entities";
import { GraduationCap, User, UserMinus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import ErrorLabel from "../../components/ErrorLabel";
import PlayerChip from "../../components/PlayerChip";
import SegmentedControl, {
  type Segment,
} from "../../components/SegmentedControl";
import SmallIconButton from "../../components/SmallIconButton";
import TeamLogo from "../../components/TeamLogo";
import { useAddToRoster, useRemoveFromRoster } from "../../rosters";

const KIND_SEGMENTS: Segment<PickableKind>[] = [
  { key: "player", label: "Player", Icon: User },
  { key: "coach", label: "Coach", Icon: GraduationCap },
];

export default function TeamRosterDialog({
  team,
  onClose,
}: {
  team: TeamWithPickables;
  onClose: () => void;
}) {
  const [vlrPlayerUrl, setVlrPlayerUrl] = useState("");
  const [kind, setKind] = useState<PickableKind>("player");
  const addToRoster = useAddToRoster(team.id);
  const removeFromRoster = useRemoveFromRoster(team.id);
  const titleId = `roster-title-${team.id}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!vlrPlayerUrl.trim()) return;
    addToRoster.mutate(
      { vlrPlayerUrl, kind },
      { onSuccess: () => setVlrPlayerUrl("") },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      slotProps={{
        paper: {
          sx: {
            width: "100%",
            maxWidth: 480,
            p: 3,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          },
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <TeamLogo imageId={team.logoImageId} size={28} />
        <Typography variant="heading" id={titleId} noWrap sx={{ flex: 1 }}>
          {team.name}
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

      <Box
        component="ul"
        aria-label="Roster"
        sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: "2px" }}
      >
        {team.pickables.map((pickable) => (
          <Box
            component="li"
            key={pickable.id}
            sx={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PlayerChip
                pickable={pickable}
                teamLogoImageId={team.logoImageId}
                size="compact"
              />
            </Box>
            <SmallIconButton
              label={`Remove ${pickable.handle}`}
              disabled={removeFromRoster.isPending}
              onClick={() => removeFromRoster.mutate(pickable.id)}
            >
              <UserMinus size={14} />
            </SmallIconButton>
          </Box>
        ))}
      </Box>

      <Box
        component="form"
        onSubmit={submit}
        sx={{ display: "flex", gap: "8px", alignItems: "center" }}
      >
        <SegmentedControl
          segments={KIND_SEGMENTS}
          selectedKey={kind}
          onSelect={setKind}
          ariaLabel="Add as"
          iconOnly
        />
        <InputBase
          autoFocus
          value={vlrPlayerUrl}
          onChange={(event) => {
            setVlrPlayerUrl(event.target.value);
            addToRoster.reset();
          }}
          placeholder="vlr.gg/player/…"
          inputProps={{ "aria-label": "VLR player link" }}
          error={addToRoster.isError}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={addToRoster.isPending}
          sx={{ height: 44, px: "18px" }}
        >
          {addToRoster.isPending ? "Adding…" : "Add"}
        </Button>
      </Box>

      <ErrorLabel
        message={addToRoster.error?.message ?? removeFromRoster.error?.message}
      />
      <Typography
        variant="body"
        sx={{ color: "var(--ink-muted)", fontSize: 12 }}
      >
        Adding a player on another team moves them here. Stages already drafting
        keep their pools.
      </Typography>
    </Dialog>
  );
}
