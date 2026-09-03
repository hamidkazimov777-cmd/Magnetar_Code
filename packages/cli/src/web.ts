import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDaemon } from "@magnetar/core";
import { createRuntime } from "./runtime.js";
import type { ParsedArgs } from "./args.js";

/** The monitor is served two ways: from the bundle inside a published install
 *  (once phase 4 ships one), or from the workspace during development. The
 *  prototype hardcoded a sibling directory that stops existing the moment the
 *  package is installed. */
function findDir(...segments: string[]): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(dir, ...segments);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function openBrowser(url: string): void {
  // Over SSH, in CI, or in a container there is no browser to open, and the
  // spawn either fails noisily or hangs.
  if (process.env.MAGNETAR_NO_BROWSER) return;
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(command, [url], {
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32",
  }).unref();
}

export async function runWeb(args: ParsedArgs, version: string): Promise<number> {
  const runtime = await createRuntime(args);
  const bundled = findDir("dist", "monitor");
  const workspace = findDir("packages", "web", "package.json");

  const daemon = await startDaemon({
    version,
    cwd: runtime.cwd,
    provider: runtime.provider,
    profile: runtime.profile,
    model: runtime.model,
    session: runtime.session,
    permissions: runtime.permissions,
    tools: runtime.tools,
    todos: runtime.todos,
    systemPrompt: runtime.systemPrompt,
    maxSteps: args.maxSteps,
    ...(bundled ? { staticDir: bundled } : {}),
    // A person is about to open a browser; do not time out under them.
    idleTimeoutMs: 0,
  });

  let child: ReturnType<typeof spawn> | null = null;

  const stop = () => {
    child?.kill("SIGTERM");
    void daemon.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  if (bundled) {
    process.stdout.write(`Monitor: ${daemon.url}\n`);
    openBrowser(daemon.url);
  } else if (workspace) {
    // Development: Next serves the UI and proxies to the daemon server-side,
    // so the token and the API key stay out of the browser.
    const webDir = path.dirname(workspace);
    process.stdout.write(`Daemon on 127.0.0.1:${daemon.port}, starting the monitor…\n`);
    child = spawn("npm", ["run", "dev"], {
      cwd: webDir,
      stdio: ["ignore", "pipe", "inherit"],
      env: {
        ...process.env,
        MAGNETAR_DAEMON_ORIGIN: `http://127.0.0.1:${daemon.port}`,
        MAGNETAR_DAEMON_TOKEN: daemon.token,
      },
    });
    let opened = false;
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      process.stdout.write(text);
      const match = /(http:\/\/localhost:\d+)/.exec(text);
      if (!opened && match) {
        opened = true;
        openBrowser(match[1]!);
      }
    });
  } else {
    process.stderr.write(
      "No monitor in this install yet — the interface ships in the next release.\n",
    );
    await daemon.close();
    return 1;
  }

  return new Promise<number>((resolve) => {
    if (child) child.on("close", (code) => resolve(code ?? 0));
    else process.on("SIGINT", () => resolve(0));
  });
}
