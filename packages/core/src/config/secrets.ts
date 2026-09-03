import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { magnetarHome } from "../paths.js";

const run = promisify(execFile);

const SERVICE = "magnetar-code";

/** Where a key ends up, so the CLI can tell the user the truth about it. */
export type SecretBackend = "keychain" | "file";

/* The OS keychain is the goal; the 0600 file is the fallback for headless
   Linux boxes and containers where no secret service is running. We report
   which one was used rather than pretending. */

async function keychainSet(id: string, value: string): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      await run("security", ["add-generic-password", "-a", id, "-s", SERVICE, "-w", value, "-U"]);
      return true;
    }
    if (process.platform === "linux") {
      await new Promise<void>((resolve, reject) => {
        const child = execFile(
          "secret-tool",
          ["store", "--label", `${SERVICE} ${id}`, "service", SERVICE, "account", id],
          (err) => (err ? reject(err) : resolve()),
        );
        child.stdin?.end(value);
      });
      return true;
    }
  } catch {
    // secret-tool / security missing or refused — fall through to the file.
  }
  return false;
}

async function keychainGet(id: string): Promise<string | null> {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await run("security", [
        "find-generic-password",
        "-a",
        id,
        "-s",
        SERVICE,
        "-w",
      ]);
      return stdout.replace(/\n$/, "");
    }
    if (process.platform === "linux") {
      const { stdout } = await run("secret-tool", ["lookup", "service", SERVICE, "account", id]);
      return stdout.replace(/\n$/, "");
    }
  } catch {
    return null;
  }
  return null;
}

async function keychainDelete(id: string): Promise<void> {
  try {
    if (process.platform === "darwin") {
      await run("security", ["delete-generic-password", "-a", id, "-s", SERVICE]);
    } else if (process.platform === "linux") {
      await run("secret-tool", ["clear", "service", SERVICE, "account", id]);
    }
  } catch {
    // Nothing stored — deleting an absent key is a success.
  }
}

function fallbackFile(env?: NodeJS.ProcessEnv): string {
  return path.join(magnetarHome(env), "secrets.json");
}

async function readFallback(env?: NodeJS.ProcessEnv): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(fallbackFile(env), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeFallback(data: Record<string, string>, env?: NodeJS.ProcessEnv): Promise<void> {
  await fs.mkdir(magnetarHome(env), { recursive: true, mode: 0o700 });
  const file = fallbackFile(env);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
  await fs.chmod(file, 0o600).catch(() => {});
}

/** MAGNETAR_API_KEY wins over stored keys — that is how CI passes one in. */
export async function getSecret(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const fromEnv = env.MAGNETAR_API_KEY;
  if (fromEnv) return fromEnv;
  if (!env.MAGNETAR_NO_KEYCHAIN) {
    const fromKeychain = await keychainGet(id);
    if (fromKeychain) return fromKeychain;
  }
  return (await readFallback(env))[id] ?? null;
}

export async function setSecret(
  id: string,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SecretBackend> {
  if (!env.MAGNETAR_NO_KEYCHAIN && (await keychainSet(id, value))) {
    // Drop any stale copy left in the fallback file by an earlier run.
    const data = await readFallback(env);
    if (id in data) {
      delete data[id];
      await writeFallback(data, env);
    }
    return "keychain";
  }
  const data = await readFallback(env);
  data[id] = value;
  await writeFallback(data, env);
  return "file";
}

export async function deleteSecret(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!env.MAGNETAR_NO_KEYCHAIN) await keychainDelete(id);
  const data = await readFallback(env);
  if (id in data) {
    delete data[id];
    await writeFallback(data, env);
  }
}
