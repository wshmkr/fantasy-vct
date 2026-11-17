import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import type { ReactNode } from "react";

interface StatChipProps {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}

export default function StatChip({ label, icon, children }: StatChipProps) {
  return (
    <Tooltip title={label}>
      <Box
        component="span"
        aria-label={label}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          height: 26,
          px: "9px",
          borderRadius: "var(--radius-sm)",
          bgcolor: "var(--pane)",
          color: "var(--ink-muted)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {icon}
        {children}
      </Box>
    </Tooltip>
  );
}
