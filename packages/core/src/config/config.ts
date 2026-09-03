import fs from "node:fs/promises";
import path from "node:path";
import { configFile, magnetarHome } from "../paths.js";
import { DEFAULT_CONFIG, type MagnetarConfig, type ProviderProfile } from "./types.js";

/** 0600 — the config carries no secrets, but it does carry endpoints, and a
 *  world-readable file in $HOME is a habit worth not forming. */
const FILE_MODE = 0o600;

export async function loadConfig(env?: NodeJS.ProcessEnv): Promise<MagnetarConfig> {
  const file = configFile(env);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { ...DEFAULT_CONFIG, providers: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MagnetarConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      version: 1,
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
    };
  } catch {
    // A corrupt config should not brick the CLI: keep the bad file for the
    // user to look at and carry on with defaults.
    await fs.rename(file, `${file}.corrupt`).catch(() => {});
    return { ...DEFAULT_CONFIG, providers: [] };
  }
}

export async function saveConfig(config: MagnetarConfig, env?: NodeJS.ProcessEnv): Promise<void> {
  const file = configFile(env);
  await fs.mkdir(magnetarHome(env), { recursive: true, mode: 0o700 });
  // Write-then-rename so an interrupted save cannot truncate a good config.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: FILE_MODE });
  await fs.rename(tmp, file);
  await fs.chmod(file, FILE_MODE).catch(() => {});
}

/** Stable id from a display name, deduplicated against what is already there.
 *  Ids never change once assigned — the keychain entry is keyed by it. */
export function providerId(name: string, taken: readonly string[]): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "provider";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

export function activeProvider(config: MagnetarConfig): ProviderProfile | undefined {
  if (config.activeProviderId) {
    const found = config.providers.find((p) => p.id === config.activeProviderId);
    if (found) return found;
  }
  return config.providers[0];
}

/** Project-scoped settings live next to the code so a team shares them. */
export function projectConfigFile(cwd: string): string {
  return path.join(path.resolve(cwd), ".magnetar", "settings.json");
}
