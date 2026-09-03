import fs from "node:fs/promises";
import path from "node:path";
import type { PermissionMode } from "../config/types.js";
import type { Tool } from "../tools/types.js";

export type Decision = "allow" | "ask";
export type Approval = "allow" | "always" | "deny";

/** Commands that only read. Asking about `git status` for the fifth time
 *  trains the user to press Y without looking, which is worse than not asking.
 *  Matched against the first two words, so `git log --oneline` is covered and
 *  `git push` is not. */
const READ_ONLY_COMMANDS = new Set([
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "wc",
  "file",
  "stat",
  "which",
  "echo",
  "date",
  "grep",
  "rg",
  "find",
  "tree",
  "du",
  "df",
  "env",
  "whoami",
  "uname",
  "sort",
  "uniq",
  "diff",
  "git status",
  "git log",
  "git diff",
  "git show",
  "git branch",
  "git remote",
  "git blame",
  "npm ls",
  "npm view",
  "npm outdated",
  "node -v",
  "node --version",
  "npm -v",
  "cargo tree",
  "cargo --version",
  "python --version",
  "python3 --version",
  "tsc --version",
]);

/** Shell metacharacters turn a safe prefix into anything at all
 *  (`ls; rm -rf .`), so a command containing them is never auto-allowed. */
const UNSAFE_SHELL = /[;&|><`$(){}]|\n/;

export function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || UNSAFE_SHELL.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  const one = words[0]!;
  const two = words.length > 1 ? `${one} ${words[1]}` : "";
  if (READ_ONLY_COMMANDS.has(two)) return true;
  // A bare verb with only flags/paths after it, e.g. `ls -la src`.
  return READ_ONLY_COMMANDS.has(one);
}

export interface PermissionRules {
  /** Tool names the user answered "always" for, in this project. */
  alwaysAllowTools: string[];
  /** Exact commands the user answered "always" for. */
  alwaysAllowCommands: string[];
}

const EMPTY: PermissionRules = { alwaysAllowTools: [], alwaysAllowCommands: [] };

export class Permissions {
  constructor(
    private mode: PermissionMode,
    private rules: PermissionRules = { ...EMPTY },
    private readonly file?: string,
  ) {}

  static async load(cwd: string, mode: PermissionMode): Promise<Permissions> {
    const file = path.join(path.resolve(cwd), ".magnetar", "permissions.json");
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<PermissionRules>;
      return new Permissions(
        mode,
        {
          alwaysAllowTools: parsed.alwaysAllowTools ?? [],
          alwaysAllowCommands: parsed.alwaysAllowCommands ?? [],
        },
        file,
      );
    } catch {
      return new Permissions(mode, { ...EMPTY }, file);
    }
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  check(tool: Tool, args: Record<string, unknown>): Decision {
    if (!tool.mutating) return "allow";
    if (this.mode === "yolo") return "allow";
    if (this.rules.alwaysAllowTools.includes(tool.name)) return "allow";

    if (tool.name === "run_command") {
      const command = typeof args.command === "string" ? args.command : "";
      if (isReadOnlyCommand(command)) return "allow";
      if (this.rules.alwaysAllowCommands.includes(command.trim())) return "allow";
      // auto-edit is about files; a shell command still gets a prompt.
      return "ask";
    }

    if (this.mode === "auto-edit") return "allow";
    return "ask";
  }

  /** Remember an "always" answer. Scoped to the project, because trusting
   *  `npm test` here says nothing about trusting it in someone else's repo. */
  async remember(tool: Tool, args: Record<string, unknown>): Promise<void> {
    if (tool.name === "run_command" && typeof args.command === "string") {
      const command = args.command.trim();
      if (!this.rules.alwaysAllowCommands.includes(command)) {
        this.rules.alwaysAllowCommands.push(command);
      }
    } else if (!this.rules.alwaysAllowTools.includes(tool.name)) {
      this.rules.alwaysAllowTools.push(tool.name);
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.file) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, `${JSON.stringify(this.rules, null, 2)}\n`, "utf8");
  }
}
