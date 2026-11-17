import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Plus } from "lucide-react";
import { useState } from "react";
import TournamentCard from "../components/TournamentCard";
import { useTournaments } from "../tournaments";
import { useMe } from "../useMe";
import NewTournamentDialog from "./NewTournamentDialog";

export default function Tournaments() {
  const me = useMe();
  const tournaments = useTournaments();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="display">Tournaments</Typography>
        {me.data?.role === "commissioner" && (
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={() => setIsCreating(true)}
          >
            New tournament
          </Button>
        )}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "18px",
        }}
      >
        {tournaments.data?.map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament} />
        ))}
      </Box>
      {isCreating && (
        <NewTournamentDialog onClose={() => setIsCreating(false)} />
      )}
    </Box>
  );
}
