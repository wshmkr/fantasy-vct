import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { APP_PRODUCT_NAME } from "@shared/branding";
import { Link } from "react-router-dom";

export function LogoMark({ size }: { size: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: `${size * 0.29}px`,
        bgcolor: "var(--accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `inset 0 1px 0 #ffffff59, 0 ${size / 4}px ${size * 0.65}px color-mix(in srgb, var(--accent) 40%, transparent)`,
      }}
    >
      <svg
        aria-hidden="true"
        width={size / 2}
        height={size / 2}
        viewBox="0 0 14 14"
      >
        <path d="M7 1.5 12.5 7 7 12.5 1.5 7z" fill="var(--on-accent)" />
      </svg>
    </Box>
  );
}

export default function SiteLogo() {
  return (
    <Box
      component={Link}
      to="/"
      aria-label={`${APP_PRODUCT_NAME} home`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        color: "var(--ink)",
        textDecoration: "none",
      }}
    >
      <LogoMark size={28} />
      <Typography variant="heading" component="span">
        {APP_PRODUCT_NAME}
      </Typography>
    </Box>
  );
}
