import type { PermissionMode } from "@magnetar/core";

export interface ParsedArgs {
  /** A sub-command such as `provider` or `web`, if one was given. */
  command?: "provider" | "web" | "doctor" | "help" | "version";
  /** Non-interactive prompt (-p / --print). */
  print?: string;
  outputFormat: "text" | "json";
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  /** Resume the newest session, or a specific one by id. */
  continue?: boolean;
  resume?: string;
  maxSteps?: number;
  maxCostUsd?: number;
  /** A bare argument: the first message to send. */
  initialMessage?: string;
  errors: string[];
}

export const HELP = `magnetar — terminal AI coding agent

USAGE
  magnetar                      start the interactive session in this directory
  magnetar "fix the build"      start with a first message
  magnetar -p "list the routes" run once, print the answer, exit
  cat err.log | magnetar -p "why does this fail"

COMMANDS
  provider     add or edit an API provider (BYOK)
  web          open the web monitor in a browser
  doctor       check the setup and report problems

OPTIONS
  -p, --print <text>       non-interactive: answer once and exit
      --output-format      text | json                      (default: text)
  -m, --model <id>         override the model for this run
  -C, --cwd <dir>          run against another directory
  -c, --continue           resume the most recent session here
  -r, --resume <id>        resume a specific session
      --permission-mode    ask | auto-edit | yolo           (default: ask)
      --max-steps <n>      stop after n agent steps         (default: 25)
      --max-cost <usd>     stop once a run costs this much
      --dangerously-skip-permissions
                           same as --permission-mode yolo
  -h, --help               show this help
  -v, --version            show the version

Inside the session, type / for commands. Run \`magnetar provider\` first.`;

const MODES: PermissionMode[] = ["ask", "auto-edit", "yolo"];

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const result: ParsedArgs = { outputFormat: "text", errors: [] };
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => {
      const value = argv[++i];
      if (value === undefined) result.errors.push(`${arg} needs a value`);
      return value;
    };

    switch (arg) {
      case "-h":
      case "--help":
        result.command = "help";
        break;
      case "-v":
      case "--version":
        result.command = "version";
        break;
      case "-p":
      case "--print":
        result.print = next() ?? "";
        break;
      case "--output-format": {
        const value = next();
        if (value === "json" || value === "text") result.outputFormat = value;
        else if (value !== undefined) result.errors.push(`unknown output format: ${value}`);
        break;
      }
      case "-m":
      case "--model":
        result.model = next();
        break;
      case "-C":
      case "--cwd":
        result.cwd = next();
        break;
      case "-c":
      case "--continue":
        result.continue = true;
        break;
      case "-r":
      case "--resume":
        result.resume = next();
        break;
      case "--permission-mode": {
        const value = next() as PermissionMode | undefined;
        if (value && MODES.includes(value)) result.permissionMode = value;
        else if (value !== undefined) result.errors.push(`unknown permission mode: ${value}`);
        break;
      }
      case "--dangerously-skip-permissions":
        result.permissionMode = "yolo";
        break;
      case "--max-steps": {
        const value = Number(next());
        if (Number.isFinite(value) && value > 0) result.maxSteps = value;
        else result.errors.push("--max-steps needs a positive number");
        break;
      }
      case "--max-cost": {
        const value = Number(next());
        if (Number.isFinite(value) && value > 0) result.maxCostUsd = value;
        else result.errors.push("--max-cost needs a positive number");
        break;
      }
      default:
        if (arg.startsWith("-")) result.errors.push(`unknown option: ${arg}`);
        else rest.push(arg);
    }
  }

  const [first, ...others] = rest;
  if (first === "provider" || first === "web" || first === "doctor") {
    result.command = first;
  } else if (first !== undefined) {
    // A bare argument is the first message, so `magnetar "fix the build"`
    // works the way people expect it to.
    result.initialMessage = [first, ...others].join(" ");
  }
  return result;
}
