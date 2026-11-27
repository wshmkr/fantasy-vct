import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

// "/" focuses the field from anywhere outside another input.
export default function SearchField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.closest("input, textarea")) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <InputBase
      inputRef={inputRef}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputProps={{ "aria-label": ariaLabel }}
      startAdornment={
        <Search
          size={14}
          color="var(--ink-muted)"
          aria-hidden
          style={{ marginRight: 8, flex: "none" }}
        />
      }
      endAdornment={
        <Typography
          component="kbd"
          variant="stat"
          sx={{
            px: "5px",
            fontSize: 10,
            lineHeight: "16px",
            color: "var(--ink-muted)",
            borderRadius: "4px",
            boxShadow: "inset 0 0 0 1px #ffffff26",
          }}
        >
          /
        </Typography>
      }
      sx={{ flex: 1, minWidth: 0, height: 34, px: "10px", fontSize: 13 }}
    />
  );
}
