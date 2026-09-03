import React from "react";
import { Box, Text } from "ink";
import { theme, WORDMARK } from "../theme.js";

export interface BannerProps {
  cwd: string;
  model: string;
  provider: string;
  version: string;
  session: string;
}

export function Banner({
  cwd,
  model,
  provider,
  version,
  session,
}: BannerProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {WORDMARK.map((line) => (
        <Text key={line} color={theme.accent}>
          {line}
        </Text>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>
          {shorten(cwd)} · {provider} · {model} · v{version}
        </Text>
        <Text color={theme.dim}>
          session {session} · type <Text color={theme.accent}>/</Text> for commands
        </Text>
      </Box>
    </Box>
  );
}

/** $HOME is noise in a header that has to fit a terminal. */
function shorten(cwd: string): string {
  const home = process.env.HOME ?? "";
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}
