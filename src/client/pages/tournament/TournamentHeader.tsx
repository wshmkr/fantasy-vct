import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Tournament } from "@shared/entities";
import { Calendar } from "lucide-react";
import { useState } from "react";
import ColorPickerPopover from "../../components/ColorPickerPopover";
import EventLogo from "../../components/EventLogo";
import ManagerStack from "../../components/ManagerStack";
import ProgressBar from "../../components/ProgressBar";
import StatusBadge from "../../components/StatusBadge";
import { useChangeMyColor } from "../../tournaments";
import { useMe } from "../../useMe";

function MatchesPill({ tournament }: { tournament: Tournament }) {
  return (
    <Tooltip title="Matches played">
      <Box
        aria-label="Matches played"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          px: "12px",
          py: "6px",
          borderRadius: "var(--radius-md)",
          bgcolor: "var(--pane)",
          boxShadow: "inset 0 0 0 1px #ffffff12",
        }}
      >
        <Calendar size={15} color="var(--ink-muted)" aria-hidden />
        <Typography variant="stat" sx={{ fontWeight: 600 }}>
          {tournament.matchesPlayed}
          <Box component="span" sx={{ color: "var(--ink-muted)" }}>
            /{tournament.matchesTotal}
          </Box>
        </Typography>
        <Box sx={{ width: 96, display: "flex" }}>
          <ProgressBar
            done={tournament.matchesPlayed}
            total={tournament.matchesTotal}
          />
        </Box>
      </Box>
    </Tooltip>
  );
}

export default function TournamentHeader({
  tournament,
}: {
  tournament: Tournament;
}) {
  const me = useMe();
  const myUserId = me.data?.id;
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const changeMyColor = useChangeMyColor(tournament.id);
  const myColor =
    tournament.members.find((member) => member.user.id === myUserId)?.color ??
    null;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <EventLogo imageId={tournament.logoImageId} size={44} />
      <Typography variant="display" sx={{ fontSize: 26, lineHeight: "32px" }}>
        {tournament.name}
      </Typography>
      <StatusBadge status={tournament.status} />
      <Box sx={{ flex: 1 }} />
      <MatchesPill tournament={tournament} />
      <Box sx={{ pl: "6px", display: "flex" }}>
        <ManagerStack
          members={tournament.members}
          size={28}
          overlap={4}
          myUserId={myUserId}
          onMyAvatarClick={setColorAnchor}
        />
      </Box>
      <ColorPickerPopover
        anchor={colorAnchor}
        onClose={() => {
          setColorAnchor(null);
          changeMyColor.reset();
        }}
        horizontalAlign="right"
        selected={myColor}
        takenColors={tournament.members.map((member) => member.color)}
        disabled={changeMyColor.isPending}
        errorMessage={changeMyColor.error?.message}
        onPick={(color) => changeMyColor.mutate(color)}
      />
    </Box>
  );
}
