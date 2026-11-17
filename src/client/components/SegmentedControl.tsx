import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import LiquidLens, { useLensRect } from "./LiquidLens";

export interface Segment<K extends string | number> {
  key: K;
  label: string;
  Icon?: LucideIcon;
  href?: string;
}

const ITEM_RADIUS = 8;

export default function SegmentedControl<K extends string | number>({
  segments,
  selectedKey,
  onSelect,
  ariaLabel,
  inPane = false,
  iconOnly = false,
}: {
  segments: Segment<K>[];
  selectedKey: K;
  onSelect?: (key: K) => void;
  ariaLabel: string;
  inPane?: boolean;
  iconOnly?: boolean;
}) {
  const { containerRef, rect } = useLensRect<HTMLDivElement>();
  const isNavigation = segments.some((segment) => segment.href);
  return (
    <Box
      ref={containerRef}
      component={isNavigation ? "nav" : "div"}
      role={isNavigation ? undefined : "tablist"}
      aria-label={ariaLabel}
      sx={{
        position: "relative",
        isolation: "isolate",
        display: "inline-flex",
        alignSelf: "flex-start",
        flex: "none",
        gap: "3px",
        p: "3px",
        borderRadius: "var(--radius-md)",
        bgcolor: inPane ? "#00000033" : "var(--pane)",
        boxShadow: "inset 0 0 0 1px var(--pane-edge)",
      }}
    >
      {segments.map(({ key, label, Icon, href }) => {
        const isSelected = key === selectedKey;
        const element = href
          ? {
              component: Link,
              to: href,
              "aria-current": isSelected ? ("page" as const) : undefined,
            }
          : {
              component: "button",
              type: "button",
              role: "tab",
              "aria-selected": isSelected,
              onClick: () => onSelect?.(key),
            };
        const item = (
          <Box
            key={key}
            {...element}
            aria-label={iconOnly ? label : undefined}
            data-lens-target={isSelected || undefined}
            sx={[
              {
                position: "relative",
                zIndex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                height: 30,
                px: iconOnly ? 0 : "12px",
                width: iconOnly ? 34 : undefined,
                border: 0,
                borderRadius: `${ITEM_RADIUS}px`,
                bgcolor: "transparent",
                font: "inherit",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                color: "var(--ink-muted)",
                cursor: "pointer",
                transition: "color 150ms ease-out",
                "&:hover": { color: "var(--ink)" },
              },
              isSelected && { color: "var(--ink)" },
            ]}
          >
            {Icon && <Icon size={iconOnly ? 14 : 15} aria-hidden />}
            {!iconOnly && label}
          </Box>
        );
        return iconOnly ? (
          <Tooltip key={key} title={label}>
            {item}
          </Tooltip>
        ) : (
          item
        );
      })}
      <LiquidLens rect={rect} cornerRadius={ITEM_RADIUS} />
    </Box>
  );
}
