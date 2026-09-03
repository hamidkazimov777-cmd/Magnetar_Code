/** marked-terminal ships no types. We use exactly one export from it. */
declare module "marked-terminal" {
  export function markedTerminal(options?: {
    width?: number;
    reflowText?: boolean;
    tab?: number;
  }): unknown;
}
