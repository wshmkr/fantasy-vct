import IconButton, { type IconButtonProps } from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { ReactNode } from "react";

interface SmallIconButtonProps extends Omit<IconButtonProps, "size"> {
  label: string;
  size?: number;
  children: ReactNode;
}

export default function SmallIconButton({
  label,
  size = 28,
  children,
  sx,
  ...props
}: SmallIconButtonProps) {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          aria-label={label}
          {...props}
          sx={[
            {
              width: size,
              height: size,
              borderRadius: "var(--radius-sm)",
              bgcolor: "var(--pane)",
              color: "var(--ink-muted)",
              "&:hover": { bgcolor: "var(--pane-hover)", color: "var(--ink)" },
            },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}
