/** One palette for the terminal, matching the monitor's: graphite ground,
 *  amber accent, no purple. Kept as hex so 256-colour terminals get the real
 *  thing; Ink falls back on its own for 16-colour ones. */
export const theme = {
  accent: "#f5a623",
  accentDim: "#8a5f16",
  text: "#e8e8e8",
  dim: "#8a8a8a",
  faint: "#5c5c5c",
  border: "#3a3a3a",
  ok: "#4ade80",
  err: "#ef4444",
  warn: "#facc15",
  user: "#7dd3fc",
} as const;

/** Block letters for the banner. Pixel type, drawn in the only medium a
 *  terminal has. */
export const WORDMARK = [
  "█▀▄▀█ ▄▀█ █▀▀ █▄ █ █▀▀ ▀█▀ ▄▀█ █▀█",
  "█ ▀ █ █▀█ █▄█ █ ▀█ ██▄  █  █▀█ █▀▄",
];
