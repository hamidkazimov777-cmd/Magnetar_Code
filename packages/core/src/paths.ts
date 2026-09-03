import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/** Root of everything Magnetar stores on this machine. Override with
 *  MAGNETAR_HOME — used by tests and by anyone running two configs side by
 *  side. */
export function magnetarHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.MAGNETAR_HOME ?? path.join(os.homedir(), ".magnetar");
}

/** Global config file. Holds provider profiles; secrets live in the OS keychain
 *  (phase 1), never here. */
export function configFile(env?: NodeJS.ProcessEnv): string {
  return path.join(magnetarHome(env), "config.json");
}

/** Sessions are scoped per working directory so `magnetar` in two projects
 *  never shows one project's history in the other. The directory name keeps a
 *  readable basename for humans plus a hash so distinct paths never collide. */
export function projectSessionsDir(cwd: string, env?: NodeJS.ProcessEnv): string {
  const hash = crypto.createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 12);
  const slug = path.basename(path.resolve(cwd)).replace(/[^a-zA-Z0-9._-]/g, "-") || "root";
  return path.join(magnetarHome(env), "projects", `${slug}-${hash}`);
}

/** Per-project memory lives in the repository itself, so it can be committed
 *  and reviewed like any other file. */
export function projectMemoryFile(cwd: string): string {
  return path.join(path.resolve(cwd), "MAGNETAR.md");
}
