import React from "react";
import { Box, Text, useInput } from "ink";
import type { Approval as Answer, ApprovalRequest } from "@magnetar/core";
import { theme } from "../theme.js";

interface Props {
  request: ApprovalRequest;
  onAnswer: (answer: Answer) => void;
}

/** Y / A / N, with the diff or command shown in full. The prototype offered
 *  only Y/N, which is how users learn to hold Y down. */
export function Approval({ request, onAnswer }: Props): React.ReactElement {
  useInput((input, key) => {
    const char = input.toLowerCase();
    if (char === "y") return onAnswer("allow");
    if (char === "a") return onAnswer("always");
    if (char === "n" || key.escape) return onAnswer("deny");
  });

  const isCommand = request.tool.name === "run_command";
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={theme.warn} paddingX={1}>
      <Text color={theme.warn} bold>
        {isCommand ? "Run this command?" : `${request.tool.name} — allow?`}
      </Text>
      <Box marginY={1}>
        <Text color={theme.text}>{request.summary}</Text>
      </Box>
      <Text color={theme.dim}>
        <Text color={theme.ok}>y</Text> allow once · <Text color={theme.ok}>a</Text> always in this
        project · <Text color={theme.err}>n</Text> deny
      </Text>
    </Box>
  );
}
