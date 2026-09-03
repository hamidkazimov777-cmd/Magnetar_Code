import React from "react";
import { Box, Text } from "ink";
import { formatCost } from "@magnetar/core";
import { theme } from "../theme.js";

interface Props {
  mode: string;
  model: string;
  busy: string | null;
  step: number;
  maxSteps: number;
  costUsd: number;
  tokens: number;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** The prototype showed a static "thinking". This says which tool is running
 *  and what the run has cost so far. */
export function StatusBar({
  mode,
  model,
  busy,
  step,
  maxSteps,
  costUsd,
  tokens,
}: Props): React.ReactElement {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setFrame((f) => f + 1), 90);
    return () => clearInterval(timer);
  }, [busy]);

  return (
    <Box justifyContent="space-between">
      <Text color={theme.dim}>
        {busy ? (
          <Text color={theme.accent}>
            {SPINNER[frame % SPINNER.length]} {busy} · step {step}/{maxSteps} · esc to stop
          </Text>
        ) : (
          <Text color={theme.dim}>{mode} · enter to send · \ then enter for a new line</Text>
        )}
      </Text>
      <Text color={theme.dim}>
        {model}
        {tokens > 0 ? ` · ${formatTokens(tokens)} tok` : ""}
        {costUsd > 0 ? ` · ${formatCost(costUsd)}` : ""}
      </Text>
    </Box>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
