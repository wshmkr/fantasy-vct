import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface SortColumn<Key extends string> {
  key: Key;
  label: string;
  alignLeft?: boolean;
}

export interface TableSort<Key extends string> {
  key: Key;
  descending: boolean;
}

export default function SortHeader<Key extends string>({
  columns,
  sort,
  onSort,
  sx,
}: {
  columns: SortColumn<Key>[];
  sort: TableSort<Key>;
  onSort: (key: Key) => void;
  sx: SxProps<Theme>;
}) {
  return (
    <Box
      sx={[
        { pb: "8px", borderBottom: "1px solid var(--pane-edge)" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {columns.map((column) => {
        const isSorted = column.key === sort.key;
        const Arrow = sort.descending ? ChevronDown : ChevronUp;
        return (
          <ButtonBase
            key={column.key}
            aria-sort={
              isSorted ? (sort.descending ? "descending" : "ascending") : "none"
            }
            onClick={() => onSort(column.key)}
            sx={[
              {
                justifyContent: column.alignLeft ? "flex-start" : "flex-end",
                gap: "2px",
                color: "var(--ink-muted)",
                "&:hover": { color: "var(--ink)" },
              },
              isSorted && { color: "var(--accent-text)" },
            ]}
          >
            <Typography
              variant="label"
              noWrap
              sx={{ fontWeight: 600, letterSpacing: "0.05em" }}
            >
              {column.label}
            </Typography>
            {isSorted && (
              <Arrow size={12} aria-hidden style={{ flex: "none" }} />
            )}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
