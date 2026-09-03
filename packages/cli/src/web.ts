import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The monitor is a workspace in this repository. A published install does not
 *  carry it — phase 3 replaces this with a bundled server, so until then say
 *  so plainly instead of failing with a confusing path error. The prototype
 *  hardcoded ../Magnetar-Web-UI and broke the moment it was installed. */
function findWebPackage(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(dir, "packages", "web", "package.json");
    if (fs.existsSync(candidate)) return path.dirname(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(command, [url], {
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32",
  }).unref();
}

export async function runWeb(): Promise<number> {
  const webDir = findWebPackage();
  if (!webDir) {
    process.stderr.write(
      "The web monitor is not part of this install yet — it ships with the local daemon in the next release.\n",
    );
    return 1;
  }
  if (
    !fs.existsSync(path.join(webDir, "node_modules")) &&
    !fs.existsSync(path.join(webDir, "..", "..", "node_modules"))
  ) {
    process.stderr.write(`Install dependencies first: npm install in ${webDir}\n`);
    return 1;
  }

  process.stdout.write("Starting the monitor…\n");
  const child = spawn("npm", ["run", "dev"], { cwd: webDir, stdio: ["ignore", "pipe", "inherit"] });

  let opened = false;
  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    process.stdout.write(text);
    const match = /(http:\/\/localhost:\d+)/.exec(text);
    if (!opened && match) {
      opened = true;
      openBrowser(match[1]!);
    }
  });

  // Ctrl+C must take the server with it; the prototype left it running.
  const stop = () => child.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("exit", stop);

  return new Promise((resolve) => child.on("close", (code) => resolve(code ?? 0)));
}
