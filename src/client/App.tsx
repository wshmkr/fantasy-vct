import { Route, Routes } from "react-router-dom";
import AppShell from "./layout/AppShell";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import Members from "./pages/Members";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/members" element={<Members />} />
      </Route>
    </Routes>
  );
}
