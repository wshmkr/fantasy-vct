import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { MANAGER_COLORS, type ManagerColor } from "@shared/entities";

interface ColorPickerProps {
  selected: ManagerColor | null;
  takenColors: ManagerColor[];
  onPick: (color: ManagerColor) => void;
  disabled?: boolean;
}

const colorName = (color: ManagerColor) =>
  color.replace("manager-", "").replace("-", " ");

export default function ColorPicker({
  selected,
  takenColors,
  onPick,
  disabled = false,
}: ColorPickerProps) {
  return (
    <Box
      role="group"
      aria-label="Colors"
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 26px)",
        gap: "9px",
      }}
    >
      {MANAGER_COLORS.map((color) => {
        const isTaken = takenColors.includes(color) && color !== selected;
        return (
          <ButtonBase
            key={color}
            aria-label={colorName(color)}
            aria-pressed={color === selected}
            disabled={disabled || isTaken}
            onClick={() => onPick(color)}
            sx={[
              {
                width: 26,
                height: 26,
                borderRadius: "var(--radius-full)",
                bgcolor: `var(--${color})`,
                boxShadow: "inset 0 1px 0 #ffffff59",
                transition: "transform 150ms ease-out",
                "&:hover": { transform: "scale(1.1)" },
              },
              isTaken && { opacity: 0.2 },
              color === selected && {
                boxShadow: "0 0 0 2px #1c1c20, 0 0 0 4px var(--ink)",
              },
            ]}
          />
        );
      })}
    </Box>
  );
}
