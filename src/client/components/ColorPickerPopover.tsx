import Popover from "@mui/material/Popover";
import type { ManagerColor } from "@shared/entities";
import ColorPicker from "./ColorPicker";
import ErrorLabel from "./ErrorLabel";

interface ColorPickerPopoverProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  horizontalAlign: "center" | "right";
  selected: ManagerColor | null;
  takenColors: ManagerColor[];
  onPick: (color: ManagerColor) => void;
  disabled: boolean;
  errorMessage: string | undefined;
}

export default function ColorPickerPopover({
  anchor,
  onClose,
  horizontalAlign,
  errorMessage,
  ...pickerProps
}: ColorPickerPopoverProps) {
  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: horizontalAlign }}
      transformOrigin={{ vertical: "top", horizontal: horizontalAlign }}
      slotProps={{ paper: { sx: { p: "12px", mt: 1 } } }}
    >
      <ColorPicker {...pickerProps} />
      <ErrorLabel
        message={errorMessage}
        sx={{ display: "block", mt: 1, textAlign: "center" }}
      />
    </Popover>
  );
}
