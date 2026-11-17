import Paper, { type PaperProps } from "@mui/material/Paper";

interface PaneProps extends PaperProps {
  dense?: boolean;
}

export default function Pane({ dense = false, sx, ...paperProps }: PaneProps) {
  return (
    <Paper
      {...paperProps}
      sx={[
        { p: 2 },
        dense && { backgroundColor: "var(--pane-dense)" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
