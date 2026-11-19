import Box from "@mui/material/Box";
import { Calendar, LayoutGrid, Settings2, Shield, Users } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import SegmentedControl, {
  type Segment,
} from "../../components/SegmentedControl";
import { useLivePolling } from "../../matches";
import { useTournament } from "../../tournaments";
import { useMe } from "../../useMe";
import DraftTab from "./draft/DraftTab";
import MatchesTab from "./matches/MatchesTab";
import RostersTab from "./RostersTab";
import SettingsTab from "./SettingsTab";
import TeamsTab from "./TeamsTab";
import TournamentHeader from "./TournamentHeader";

const MEMBER_TABS = [
  { key: "rosters", label: "Rosters", Icon: Users },
  { key: "matches", label: "Matches", Icon: Calendar },
  { key: "draft", label: "Draft", Icon: LayoutGrid },
  { key: "teams", label: "Teams", Icon: Shield },
];
const COMMISSIONER_TABS = [
  ...MEMBER_TABS,
  { key: "settings", label: "Settings", Icon: Settings2 },
];

export default function Tournament() {
  const params = useParams();
  const tournamentId = Number(params.tournamentId);
  const tab = params.tab ?? "rosters";
  const me = useMe();
  const tournament = useTournament(tournamentId);
  useLivePolling(tournamentId);
  const tabs =
    me.data?.role === "commissioner" ? COMMISSIONER_TABS : MEMBER_TABS;
  const segments: Segment<string>[] = tabs.map((definition) => ({
    ...definition,
    href: `/tournaments/${tournamentId}/${definition.key}`,
  }));

  if (!tabs.some(({ key }) => key === tab)) {
    return <Navigate to={`/tournaments/${tournamentId}`} replace />;
  }
  if (!tournament.data) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <TournamentHeader tournament={tournament.data} />
        <SegmentedControl
          segments={segments}
          selectedKey={tab}
          ariaLabel="Tournament sections"
        />
      </Box>
      {tab === "rosters" && <RostersTab tournament={tournament.data} />}
      {tab === "matches" && <MatchesTab tournament={tournament.data} />}
      {tab === "draft" && <DraftTab tournament={tournament.data} />}
      {tab === "teams" && <TeamsTab tournamentId={tournamentId} />}
      {tab === "settings" && <SettingsTab tournament={tournament.data} />}
    </Box>
  );
}
