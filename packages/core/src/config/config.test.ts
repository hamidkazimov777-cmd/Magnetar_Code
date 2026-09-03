import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig, saveConfig, providerId, activeProvider } from "./config.js";
import { getSecret, setSecret, deleteSecret } from "./secrets.js";
import { DEFAULT_CONFIG, type MagnetarConfig } from "./types.js";
import { configFile } from "../paths.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-cfg-"));
  // Never touch the developer's real keychain from a test run.
  env = { MAGNETAR_HOME: home, MAGNETAR_NO_KEYCHAIN: "1" } as NodeJS.ProcessEnv;
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("config", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await loadConfig(env)).toEqual({ ...DEFAULT_CONFIG, providers: [] });
  });

  it("round-trips and stores no secrets", async () => {
    const config: MagnetarConfig = {
      version: 1,
      providers: [{ id: "openai", name: "OpenAI", baseUrl: "https://x/v1", model: "gpt-5" }],
      activeProviderId: "openai",
      permissionMode: "ask",
    };
    await saveConfig(config, env);
    expect(await loadConfig(env)).toEqual(config);
    expect(await fs.readFile(configFile(env), "utf8")).not.toContain("sk-");
  });

  it("writes the file readable only by its owner", async () => {
    await saveConfig({ ...DEFAULT_CONFIG, providers: [] }, env);
    const stat = await fs.stat(configFile(env));
    expect(stat.mode & 0o077).toBe(0);
  });

  it("keeps a corrupt config for the user instead of crashing", async () => {
    await fs.mkdir(home, { recursive: true });
    await fs.writeFile(configFile(env), "{not json");
    expect((await loadConfig(env)).providers).toEqual([]);
    expect(await fs.readFile(`${configFile(env)}.corrupt`, "utf8")).toBe("{not json");
  });

  it("derives readable, unique ids", () => {
    expect(providerId("Kimi (Moonshot)", [])).toBe("kimi-moonshot");
    expect(providerId("OpenAI", ["openai"])).toBe("openai-2");
    expect(providerId("!!!", [])).toBe("provider");
  });

  it("falls back to the first provider when the active one is gone", () => {
    const config: MagnetarConfig = {
      version: 1,
      permissionMode: "ask",
      activeProviderId: "deleted",
      providers: [{ id: "a", name: "A", baseUrl: "u", model: "m" }],
    };
    expect(activeProvider(config)?.id).toBe("a");
    expect(activeProvider({ ...config, providers: [] })).toBeUndefined();
  });
});

describe("secrets", () => {
  it("stores and reads back a key through the file fallback", async () => {
    expect(await setSecret("openai", "sk-test", env)).toBe("file");
    expect(await getSecret("openai", env)).toBe("sk-test");
    await deleteSecret("openai", env);
    expect(await getSecret("openai", env)).toBeNull();
  });

  it("keeps the fallback file owner-only", async () => {
    await setSecret("openai", "sk-test", env);
    const stat = await fs.stat(path.join(home, "secrets.json"));
    expect(stat.mode & 0o077).toBe(0);
  });

  it("lets the environment override stored keys, for CI", async () => {
    await setSecret("openai", "stored", env);
    expect(await getSecret("openai", { ...env, MAGNETAR_API_KEY: "from-env" })).toBe("from-env");
  });

  it("keeps providers' keys apart", async () => {
    await setSecret("a", "key-a", env);
    await setSecret("b", "key-b", env);
    expect(await getSecret("a", env)).toBe("key-a");
    await deleteSecret("a", env);
    expect(await getSecret("b", env)).toBe("key-b");
  });
});
