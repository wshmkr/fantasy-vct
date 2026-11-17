import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";

interface ErrorLabelProps {
  message: string | null | undefined;
  sx?: SxProps<Theme>;
}

export default function ErrorLabel({ message, sx }: ErrorLabelProps) {
  if (!message) return null;
  return (
    <Typography
      variant="label"
      role="alert"
      sx={[{ color: "var(--loss)" }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {message}
    </Typography>
  );
}
