import Box from "@mui/material/Box";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

export interface TabDefinition {
  key: string;
  label: string;
  Icon: LucideIcon;
}

interface TournamentTabsProps {
  tabs: TabDefinition[];
  selectedKey: string;
  tournamentId: number;
}

export default function TournamentTabs({
  tabs,
  selectedKey,
  tournamentId,
}: TournamentTabsProps) {
  return (
    <Box
      component="nav"
      aria-label="Tournament sections"
      sx={{
        display: "inline-flex",
        alignSelf: "flex-start",
        gap: "3px",
        p: "3px",
        borderRadius: "11px",
        bgcolor: "var(--pane)",
        boxShadow: "inset 0 0 0 1px #ffffff14",
      }}
    >
      {tabs.map(({ key, label, Icon }) => {
        const isSelected = key === selectedKey;
        return (
          <Box
            key={key}
            component={Link}
            to={`/tournaments/${tournamentId}/${key}`}
            aria-current={isSelected ? "page" : undefined}
            sx={[
              {
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                px: "12px",
                py: "6px",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                color: "var(--ink-muted)",
                transition: "background-color 150ms ease-out, color 150ms",
                "&:hover": { color: "var(--ink)" },
              },
              isSelected && {
                bgcolor: "#ffffff17",
                color: "var(--ink)",
                boxShadow:
                  "inset 1px 1px 0 #ffffff47, inset -1px -1px 0 #ffffff0f, inset 0 0 0 1px #ffffff1a, 0 6px 16px #00000073",
              },
            ]}
          >
            <Icon size={15} aria-hidden />
            {label}
          </Box>
        );
      })}
    </Box>
  );
}
