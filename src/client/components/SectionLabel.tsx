import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

export default function SectionLabel({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      variant="label"
      component="h2"
      sx={[
        {
          color: "var(--ink-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}
