import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  deleteFact,
  factsDir,
  globalMemoryFile,
  memoryPrompt,
  readMemory,
  saveFact,
  writeMemory,
} from "./memory.js";

let home: string;
let cwd: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-mem-home-"));
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-mem-proj-"));
  env = { MAGNETAR_HOME: home } as NodeJS.ProcessEnv;
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(cwd, { recursive: true, force: true });
});

describe("memory", () => {
  it("is empty when a project has none", async () => {
    expect(await readMemory(cwd, env)).toEqual([]);
    expect(await memoryPrompt(cwd, env)).toBe("");
  });

  it("reads the global file, the project file and the facts, in that order", async () => {
    await writeMemory(globalMemoryFile(env), "Answer in Russian.");
    await writeMemory(path.join(cwd, "MAGNETAR.md"), "Build with npm run build.");
    await saveFact(cwd, {
      name: "deploy target",
      description: "where this ships",
      type: "project",
      body: "Deploys to Fly.io from main.",
    });

    const files = await readMemory(cwd, env);
    expect(files.map((file) => file.scope)).toEqual(["global", "project", "fact"]);

    const prompt = await memoryPrompt(cwd, env);
    expect(prompt.indexOf("Russian")).toBeLessThan(prompt.indexOf("npm run build"));
    expect(prompt).toContain("Fly.io");
  });

  it("ignores an empty file rather than padding the prompt with nothing", async () => {
    await writeMemory(path.join(cwd, "MAGNETAR.md"), "   \n");
    expect(await readMemory(cwd, env)).toEqual([]);
  });

  it("writes a fact with frontmatter and a readable slug", async () => {
    const file = await saveFact(cwd, {
      name: "Deploy Target!",
      description: "where this ships",
      type: "reference",
      body: "Fly.io",
    });
    expect(path.basename(file)).toBe("deploy-target.md");
    const content = await fs.readFile(file, "utf8");
    expect(content).toContain("name: deploy-target");
    expect(content).toContain("type: reference");
    expect(content).toContain("Fly.io");
  });

  it("keeps MEMORY.md as an index and removes it with the last fact", async () => {
    await saveFact(cwd, { name: "a", description: "first", type: "project", body: "one" });
    await saveFact(cwd, { name: "b", description: "second", type: "project", body: "two" });
    const index = await fs.readFile(path.join(factsDir(cwd), "MEMORY.md"), "utf8");
    expect(index).toContain("[a](a.md) — first");
    expect(index).toContain("[b](b.md) — second");
    // The index is not itself a fact.
    expect((await readMemory(cwd, env)).map((f) => f.name)).toEqual(["a.md", "b.md"]);

    await deleteFact(cwd, "a");
    await deleteFact(cwd, "b.md");
    expect(
      await fs.readFile(path.join(factsDir(cwd), "MEMORY.md"), "utf8").catch(() => null),
    ).toBeNull();
  });
});
