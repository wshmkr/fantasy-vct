import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { API_ROUTES } from "@shared/api";
import { MAX_MANAGERS, type Tournament } from "@shared/entities";
import { Calendar, Shield, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useJoinTournament } from "../tournaments";
import { useMe } from "../useMe";
import ColorPickerPopover from "./ColorPickerPopover";
import EventLogo from "./EventLogo";
import ManagerStack from "./ManagerStack";
import Pane from "./Pane";
import ProgressBar from "./ProgressBar";
import StageChips from "./StageChips";
import StatChip from "./StatChip";
import StatusBadge from "./StatusBadge";

function CardHeader({ tournament }: { tournament: Tournament }) {
  return (
    <Box
      sx={{
        position: "relative",
        height: 128,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderBottom: "1px solid #ffffff12",
      }}
    >
      {tournament.logoImageId !== null && (
        <Box
          component="img"
          src={API_ROUTES.image(tournament.logoImageId)}
          alt=""
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(28px) brightness(0.45) saturate(1.4)",
            transform: "scale(1.6)",
          }}
        />
      )}
      <EventLogo imageId={tournament.logoImageId} size={60} />
      <Box sx={{ position: "absolute", top: 12, right: 12 }}>
        <StatusBadge status={tournament.status} />
      </Box>
    </Box>
  );
}

function JoinButton({ tournament }: { tournament: Tournament }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const join = useJoinTournament(tournament.id);
  return (
    <>
      <Button
        variant="contained"
        startIcon={<UserPlus size={16} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ position: "relative", zIndex: 1, height: 36 }}
      >
        Join
      </Button>
      <ColorPickerPopover
        anchor={anchor}
        onClose={() => {
          setAnchor(null);
          join.reset();
        }}
        horizontalAlign="center"
        selected={null}
        takenColors={tournament.members.map((member) => member.color)}
        disabled={join.isPending}
        errorMessage={join.error?.message}
        onPick={(color) =>
          join.mutate(color, { onSuccess: () => setAnchor(null) })
        }
      />
    </>
  );
}

export default function TournamentCard({
  tournament,
}: {
  tournament: Tournament;
}) {
  const me = useMe();
  const canJoin =
    tournament.joiningOpen &&
    tournament.members.length < MAX_MANAGERS &&
    !tournament.members.some((member) => member.user.id === me.data?.id);

  return (
    <Pane
      component="article"
      sx={{
        p: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform 180ms ease-out, background-color 180ms ease-out",
        "&:hover": {
          transform: "translateY(-2px)",
          backgroundColor: "var(--pane-hover)",
        },
      }}
    >
      <CardHeader tournament={tournament} />
      <Box
        sx={{
          p: "16px 18px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <Typography
          variant="heading"
          component={Link}
          to={`/tournaments/${tournament.id}`}
          sx={{
            fontSize: 17,
            lineHeight: "22px",
            color: "var(--ink)",
            textDecoration: "none",
            "&::after": { content: '""', position: "absolute", inset: 0 },
          }}
        >
          {tournament.name}
        </Typography>
        <StageChips stages={tournament.stages} />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <StatChip label="Teams" icon={<Shield size={13} aria-hidden />}>
            {tournament.teamCount}
          </StatChip>
          <StatChip label="Managers">
            <ManagerStack members={tournament.members} size={20} overlap={5} />
            {tournament.members.length}/{MAX_MANAGERS}
          </StatChip>
          <Box sx={{ ml: "auto" }}>
            <StatChip
              label="Matches played"
              icon={<Calendar size={13} aria-hidden />}
            >
              {tournament.matchesPlayed}/{tournament.matchesTotal}
            </StatChip>
          </Box>
        </Box>
        <ProgressBar
          done={tournament.matchesPlayed}
          total={tournament.matchesTotal}
          muted={tournament.status === "ended"}
        />
        {canJoin && <JoinButton tournament={tournament} />}
      </Box>
    </Pane>
  );
}
