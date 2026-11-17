import { Route, Routes } from "react-router-dom";
import AppShell from "./layout/AppShell";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import Members from "./pages/Members";
import Tournaments from "./pages/Tournaments";
import Tournament from "./pages/tournament/Tournament";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Tournaments />} />
        <Route
          path="/tournaments/:tournamentId/:tab?"
          element={<Tournament />}
        />
        <Route path="/members" element={<Members />} />
      </Route>
    </Routes>
  );
}
