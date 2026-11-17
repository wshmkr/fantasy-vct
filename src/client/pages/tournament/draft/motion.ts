import { keyframes } from "@mui/material/styles";

// The 6px spread clears the 4px manager ring that the avatar draws on top.
export const avatarGlow =
  "0 0 0 6px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 50%, transparent)";
const brightGlow =
  "0 0 0 6px var(--accent), 0 0 26px color-mix(in srgb, var(--accent) 85%, transparent)";

const glowCycle = keyframes`
  0%, 100% { box-shadow: ${avatarGlow}; }
  50% { box-shadow: ${brightGlow}; }
`;

export const avatarBreathingGlow = `${glowCycle} 2.4s ease-in-out infinite`;
export const avatarUrgentGlow = `${glowCycle} 0.7s ease-in-out infinite`;

const shakeFrames = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
`;
export const shake = `${shakeFrames} 320ms ease-out`;

const riseFrames = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
`;
export const riseIn = `${riseFrames} 260ms ease-out`;

const flipFrames = keyframes`
  from { transform: rotateX(90deg); opacity: 0.3; }
  to { transform: none; opacity: 1; }
`;
export const flipIn = `${flipFrames} 360ms ease-out`;
