import Box from "@mui/material/Box";
import { grainLayer } from "../theme";

export default function Background() {
  return (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        background: [
          "radial-gradient(70rem 50rem at 0% 0%, var(--bg-glow-tl), transparent 70%)",
          "radial-gradient(70rem 50rem at 100% 100%, var(--bg-glow-br), transparent 70%)",
          "var(--bg)",
        ].join(", "),
        "&::after": grainLayer,
      }}
    />
  );
}
