import type { OpenAICompatibleProvider } from "../providers/openai.js";
import type { Message } from "../providers/types.js";
import { estimateTokens } from "./cost.js";

/** Compact when the transcript passes this many estimated tokens. Deliberately
 *  below a typical 128k window: the point is to act before the provider starts
 *  returning 400s, which is what the prototype did instead. */
export const COMPACT_THRESHOLD_TOKENS = 60_000;

/** Turns kept verbatim at the tail. Everything older is summarised. */
const KEEP_RECENT = 12;

export function transcriptTokens(messages: readonly Message[]): number {
  return messages.reduce(
    (total, message) =>
      total +
      estimateTokens(message.content ?? "") +
      estimateTokens(JSON.stringify(message.tool_calls ?? "")),
    0,
  );
}

export function shouldCompact(
  messages: readonly Message[],
  threshold = COMPACT_THRESHOLD_TOKENS,
): boolean {
  return messages.length > KEEP_RECENT + 4 && transcriptTokens(messages) > threshold;
}

const SUMMARY_MARKER = "[Earlier in this session]";

export function isSummary(message: Message): boolean {
  return message.role === "user" && (message.content ?? "").startsWith(SUMMARY_MARKER);
}

/** Replace the old head of the transcript with a summary, keeping the recent
 *  tail verbatim. A previous summary is folded into the new one so summaries
 *  do not stack up. */
export async function compact(
  messages: readonly Message[],
  provider: OpenAICompatibleProvider,
  model: string,
  signal?: AbortSignal,
): Promise<Message[]> {
  const recent = messages.slice(-KEEP_RECENT);
  const older = messages.slice(0, -KEEP_RECENT);
  if (older.length === 0) return [...messages];

  const transcript = older
    .map((message) => {
      const who = message.role === "tool" ? `tool:${message.name ?? ""}` : message.role;
      const body =
        message.content ?? (message.tool_calls ? JSON.stringify(message.tool_calls) : "");
      return `${who}: ${body.slice(0, 4000)}`;
    })
    .join("\n\n");

  const summary = await provider.complete({
    model,
    signal,
    messages: [
      {
        role: "system",
        content:
          "Summarise this coding session so another agent can continue it. Keep: what the user asked for, decisions made and why, files created or changed with their paths, commands that worked or failed, and what is still unfinished. Drop pleasantries and file contents. Be specific and dense; no more than 500 words.",
      },
      { role: "user", content: transcript },
    ],
  });

  // A failed summarisation must not silently drop the history it replaces.
  if (!summary.trim()) return [...messages];

  // A tool result cannot be the first message after the summary — it would
  // reference a tool call that no longer exists in the transcript.
  const tail = [...recent];
  while (tail.length > 0 && tail[0]!.role === "tool") tail.shift();

  return [{ role: "user", content: `${SUMMARY_MARKER}\n${summary.trim()}` }, ...tail];
}
