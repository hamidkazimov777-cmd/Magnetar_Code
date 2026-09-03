import { spawn } from "node:child_process";
import { optNum, str, type Tool, type ToolContext, type ToolResult } from "./types.js";
import { truncate } from "./text.js";

export const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_CAPTURE = 200_000;

/** Run a command with the three guards the prototype was missing: a timeout, a
 *  cap on captured output, and a kill path wired to the run's abort signal.
 *  Without them `npm run dev` hung the agent forever and a chatty build filled
 *  memory. */
export function runCommand(
  command: string,
  ctx: ToolContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd: ctx.cwd,
      // Own process group, so killing the shell also kills what it started.
      detached: process.platform !== "win32",
      env: { ...process.env, MAGNETAR: "1", GIT_PAGER: "cat", PAGER: "cat" },
    });

    let out = "";
    let truncated = false;
    let settled = false;

    const capture = (chunk: Buffer) => {
      if (out.length >= MAX_CAPTURE) {
        truncated = true;
        return;
      }
      out += chunk.toString("utf8");
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);

    const kill = () => {
      try {
        if (process.platform === "win32") child.kill();
        else process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };

    const timer = setTimeout(() => {
      kill();
      finish(`Command timed out after ${Math.round(timeoutMs / 1000)}s and was killed.`, true);
    }, timeoutMs);

    const onAbort = () => {
      kill();
      finish("Command was cancelled.", true);
    };
    ctx.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (note: string | null, isError: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onAbort);
      const body = truncated ? `${out}\n[... output truncated]` : out;
      const text = [note, body.trim()].filter(Boolean).join("\n\n");
      resolve({ output: truncate(text) || "(no output)", isError });
    };

    child.on("error", (error) => finish(`Failed to start: ${error.message}`, true));
    child.on("close", (code) => {
      finish(code === 0 ? null : `Exited with code ${code}.`, code !== 0);
    });
  });
}

export const runCommandTool: Tool = {
  name: "run_command",
  description:
    "Run a shell command in the project directory. Use it for builds, tests and git. Prefer read_file/glob/grep for reading the repository — they are cheaper.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The command to run" },
      timeout_ms: {
        type: "number",
        description: `Default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}`,
      },
    },
    required: ["command"],
  },
  summarize: (args) => String(args.command ?? ""),
  run(args, ctx) {
    const timeout = Math.min(optNum(args, "timeout_ms") ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    return runCommand(str(args, "command"), ctx, timeout);
  },
};
