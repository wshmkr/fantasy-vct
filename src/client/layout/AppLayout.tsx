import Box from "@mui/material/Box";
import { Outlet } from "react-router-dom";
import Background from "./Background";

export default function AppLayout() {
  return (
    <>
      <Background />
      <Box component="main" sx={{ maxWidth: 1320, mx: "auto", p: 4 }}>
        <Outlet />
      </Box>
    </>
  );
}
