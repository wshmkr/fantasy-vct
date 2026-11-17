import Box from "@mui/material/Box";
import { Navigate, Outlet } from "react-router-dom";
import SiteLogo from "../components/SiteLogo";
import { useMe } from "../useMe";
import Background from "./Background";

export default function AppShell() {
  const me = useMe();

  if (me.isError) return <Navigate to="/login" replace />;

  return (
    <>
      <Background />
      <Box sx={{ maxWidth: 1320, mx: "auto", px: 5, pt: 3, pb: 5 }}>
        <SiteLogo />
        <Box component="main" sx={{ pt: 5 }}>
          {me.data && <Outlet />}
        </Box>
      </Box>
    </>
  );
}
