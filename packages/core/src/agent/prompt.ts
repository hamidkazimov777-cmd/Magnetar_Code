import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { magnetarHome, projectMemoryFile } from "../paths.js";
import { runCommand } from "../tools/shell.js";

export interface PromptContext {
  cwd: string;
  permissionMode: string;
  locale?: "en" | "ru";
}

/** The prototype sent no system prompt at all: the model did not know the OS,
 *  the directory, or that it was allowed to use tools. */
export async function buildSystemPrompt(ctx: PromptContext): Promise<string> {
  const [tree, git, memory] = await Promise.all([
    topLevelListing(ctx.cwd),
    gitSummary(ctx.cwd),
    loadMemory(ctx.cwd),
  ]);

  const sections = [
    `You are Magnetar, an AI coding agent running in the user's terminal.

You work by using tools, not by describing what the user should do. Read before
you edit. Prefer read_file, glob and grep over shell commands for inspecting the
repository. Make the smallest change that solves the task and match the style of
the surrounding code.

Be concise: this output goes to a terminal, not a document. Skip preamble,
skip summaries of code the user can see, and never explain what you are about
to do before every tool call. When a task takes several steps, record the plan
with todo_write and keep it current.

Never invent file contents or command output — run the tool and read the result.
If a tool fails, say so plainly and either fix the cause or stop and ask.`,

    `# Environment
Platform: ${process.platform} (${os.release()})
Working directory: ${path.resolve(ctx.cwd)}
Date: ${new Date().toISOString().slice(0, 10)}
Approval mode: ${ctx.permissionMode}${
      ctx.permissionMode === "ask"
        ? " — file writes and shell commands are shown to the user for approval before they run"
        : ""
    }`,

    git ? `# Git\n${git}` : "",
    tree ? `# Project root\n${tree}` : "",
    memory
      ? `# Project instructions (MAGNETAR.md)\nThese are the user's own rules for this repository. Follow them.\n\n${memory}`
      : "",
    ctx.locale === "ru"
      ? "# Language\nReply in Russian unless the user writes in another language."
      : "",
  ];

  return sections.filter(Boolean).join("\n\n");
}

async function topLevelListing(cwd: string): Promise<string> {
  const entries = await fs.readdir(cwd, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .slice(0, 40)
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .join(", ");
}

async function gitSummary(cwd: string): Promise<string> {
  const result = await runCommand("git rev-parse --abbrev-ref HEAD 2>/dev/null", { cwd }, 5000);
  if (result.isError) return "";
  const branch = result.output.trim();
  if (!branch) return "";
  const status = await runCommand("git status --porcelain 2>/dev/null | head -20", { cwd }, 5000);
  const changed = status.output.trim();
  return `Branch: ${branch}${changed && changed !== "(no output)" ? `\nUncommitted changes:\n${changed}` : "\nWorking tree clean"}`;
}

/** Global preferences first, then the project's own file — the project wins
 *  because it is more specific. */
async function loadMemory(cwd: string): Promise<string> {
  const global = await fs
    .readFile(path.join(magnetarHome(), "MAGNETAR.md"), "utf8")
    .catch(() => "");
  const project = await fs.readFile(projectMemoryFile(cwd), "utf8").catch(() => "");
  return [global.trim(), project.trim()].filter(Boolean).join("\n\n---\n\n").slice(0, 32_000);
}
