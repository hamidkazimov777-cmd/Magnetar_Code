import fs from "node:fs/promises";
import path from "node:path";
import {
  COMPACT_THRESHOLD_TOKENS,
  compact,
  formatCost,
  readMemory,
  runCommand,
  transcriptTokens,
  type Message,
} from "@magnetar/core";
import type { Runtime } from "./runtime.js";
import { COMMANDS } from "./commands.js";

/** Handlers for the slash commands that are pure text in, text out. Keeping
 *  them out of the component makes them testable and the view small. */

export function helpText(): string {
  const width = Math.max(...COMMANDS.map((c) => c.name.length));
  const commands = COMMANDS.map(
    (c) => `  ${c.name.padEnd(width)}  ${c.description}${c.argument ? ` ${c.argument}` : ""}`,
  ).join("\n");
  return `Commands\n${commands}

Keys
  enter          send
  \\ then enter   new line (Option+Enter works too)
  ↑ ↓            input history
  esc            stop the current run
  ctrl+c twice   quit`;
}

export function toolsText(runtime: Runtime): string {
  return runtime.tools
    .map(
      (tool) =>
        `  ${tool.mutating ? "!" : " "} ${tool.name.padEnd(14)} ${tool.description.split(".")[0]}`,
    )
    .join("\n");
}

export function costText(runtime: Runtime): string {
  const meta = runtime.session.meta;
  return `session ${meta.id} · ${meta.messageCount} messages · ${formatCost(meta.costUsd)} · model ${runtime.model}`;
}

export function contextText(runtime: Runtime): string {
  const used = transcriptTokens(runtime.session.history());
  const percent = Math.round((used / COMPACT_THRESHOLD_TOKENS) * 100);
  const filled = Math.round(Math.min(percent, 100) / 5);
  const bar = `${"█".repeat(filled)}${"░".repeat(20 - filled)}`;
  return `${bar} ~${used.toLocaleString()} tokens · compaction at ${COMPACT_THRESHOLD_TOKENS.toLocaleString()}`;
}

export async function memoryText(cwd: string): Promise<string> {
  const files = await readMemory(cwd);
  if (files.length === 0) {
    return "No memory for this project yet. Run /init to write a MAGNETAR.md.";
  }
  return files
    .map((file) => `${file.name}  ${dim(file.file)}\n${file.content.trim()}`)
    .join("\n\n");
}

function dim(text: string): string {
  const home = process.env.HOME ?? "";
  return home && text.startsWith(home) ? `~${text.slice(home.length)}` : text;
}

export async function attachFile(cwd: string, relative: string): Promise<Message> {
  const target = path.resolve(cwd, relative);
  const content = await fs.readFile(target, "utf8");
  const capped =
    content.length > 100_000 ? `${content.slice(0, 100_000)}\n[... truncated]` : content;
  return {
    role: "user",
    content: `Attached ${path.relative(cwd, target)}:\n\n\`\`\`\n${capped}\n\`\`\``,
  };
}

export async function diffText(cwd: string): Promise<string> {
  const result = await runCommand("git diff --stat && git diff", { cwd }, 15_000);
  if (result.isError) return "Not a git repository, or git is unavailable.";
  return result.output.trim() === "(no output)" ? "No changes in the working tree." : result.output;
}

/** Undo only touches files this session changed, and only ones git can
 *  restore — reverting the user's own uncommitted work would be worse than
 *  the mistake being undone. */
export async function undoFiles(cwd: string, files: readonly string[]): Promise<string> {
  if (files.length === 0) return "This session has not changed any files.";
  const quoted = files.map((file) => JSON.stringify(file)).join(" ");
  const restore = await runCommand(`git checkout -- ${quoted}`, { cwd }, 15_000);
  if (restore.isError) return `Could not restore: ${restore.output}`;
  return `Restored ${files.length} file${files.length === 1 ? "" : "s"}: ${files.join(", ")}`;
}

export async function exportSession(runtime: Runtime): Promise<string> {
  const lines = [`# ${runtime.session.meta.title}`, "", `Model: ${runtime.model}`, ""];
  for (const message of runtime.session.history()) {
    if (message.role === "user") lines.push(`## You`, "", message.content ?? "", "");
    else if (message.role === "assistant" && message.content)
      lines.push(`## Magnetar`, "", message.content, "");
    else if (message.role === "tool")
      lines.push(`> ${message.name}: ${(message.content ?? "").split("\n")[0]}`, "");
  }
  const file = path.join(runtime.cwd, `magnetar-${runtime.session.meta.id}.md`);
  await fs.writeFile(file, lines.join("\n"), "utf8");
  return `Wrote ${file}`;
}

export const INIT_TOOLS = ["read_file", "list_dir", "glob", "grep", "write_file", "todo_write"];

const INIT_PROMPT = `Analyse this repository and write its memory file.

Inspect it first, do not guess: read the package manifests, the README, the
build and test configuration, and walk the important directories. Use glob and
grep rather than shelling out.

Then write MAGNETAR.md at the project root with write_file. Cover, in this
order: what the project is and what it is for; how to build, run and test it,
with the exact commands; the layout of the directories that matter and what
lives in each; the conventions a contributor must follow; and the traps — the
things that look wrong but are deliberate, and the things that break if you
touch them.

Be concrete and specific to this repository. No filler, no generic advice, no
restating what any reader could see from the file tree. Under 60 lines.

When it is written, say in one sentence what you learned that surprised you.
`;

export function initPrompt(): string {
  return INIT_PROMPT;
}

export async function compactNow(runtime: Runtime): Promise<string> {
  const before = runtime.session.history().length;
  const compacted = await compact([...runtime.session.history()], runtime.provider, runtime.model);
  if (compacted.length >= before) return "Nothing old enough to compact yet.";
  await runtime.session.replaceHistory(compacted);
  return `Compacted ${before} messages into ${compacted.length}.`;
}
