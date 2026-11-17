import Box from "@mui/material/Box";
import { LayoutGrid, Settings2, Shield, Users } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { useTournament } from "../../tournaments";
import { useMe } from "../../useMe";
import SettingsTab from "./SettingsTab";
import TeamsTab from "./TeamsTab";
import TournamentHeader from "./TournamentHeader";
import TournamentTabs, { type TabDefinition } from "./TournamentTabs";

const MEMBER_TABS: TabDefinition[] = [
  { key: "rosters", label: "Rosters", Icon: Users },
  { key: "draft", label: "Draft", Icon: LayoutGrid },
  { key: "teams", label: "Teams", Icon: Shield },
];
const COMMISSIONER_TABS: TabDefinition[] = [
  ...MEMBER_TABS,
  { key: "settings", label: "Settings", Icon: Settings2 },
];

export default function Tournament() {
  const params = useParams();
  const tournamentId = Number(params.tournamentId);
  const tab = params.tab ?? "rosters";
  const me = useMe();
  const tournament = useTournament(tournamentId);
  const tabs =
    me.data?.role === "commissioner" ? COMMISSIONER_TABS : MEMBER_TABS;

  if (!tabs.some(({ key }) => key === tab)) {
    return <Navigate to={`/tournaments/${tournamentId}`} replace />;
  }
  if (!tournament.data) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <TournamentHeader tournament={tournament.data} />
        <TournamentTabs
          tabs={tabs}
          selectedKey={tab}
          tournamentId={tournamentId}
        />
      </Box>
      {tab === "teams" && <TeamsTab tournamentId={tournamentId} />}
      {tab === "settings" && <SettingsTab tournament={tournament.data} />}
    </Box>
  );
}
