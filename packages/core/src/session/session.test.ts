import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Session } from "./session.js";
import { projectSessionsDir } from "../paths.js";

let home: string;
let cwd: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-home-"));
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-proj-"));
  env = { MAGNETAR_HOME: home } as NodeJS.ProcessEnv;
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(cwd, { recursive: true, force: true });
});

describe("Session", () => {
  it("round-trips a transcript", async () => {
    const session = await Session.create(cwd, "gpt-5", env);
    await session.append({ role: "user", content: "fix the build" });
    await session.append({ role: "assistant", content: "done" });

    const reopened = await Session.open(cwd, session.meta.id, env);
    expect(reopened?.history()).toEqual([
      { role: "user", content: "fix the build" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("titles itself from the first user turn", async () => {
    const session = await Session.create(cwd, undefined, env);
    await session.append({ role: "user", content: "  add   a health check endpoint " });
    expect(session.meta.title).toBe("add a health check endpoint");
    await session.append({ role: "user", content: "and tests" });
    expect(session.meta.title).toBe("add a health check endpoint");
  });

  it("survives a half-written final line", async () => {
    const session = await Session.create(cwd, undefined, env);
    await session.append({ role: "user", content: "hello" });
    const file = path.join(projectSessionsDir(cwd, env), `${session.meta.id}.jsonl`);
    await fs.appendFile(file, '{"kind":"message","mess');

    const reopened = await Session.open(cwd, session.meta.id, env);
    expect(reopened?.history()).toHaveLength(1);
  });

  it("lists newest first and keeps projects apart", async () => {
    const a = await Session.create(cwd, undefined, env);
    await a.append({ role: "user", content: "first" });
    const b = await Session.create(cwd, undefined, env);
    await b.append({ role: "user", content: "second" });

    const list = await Session.list(cwd, env);
    expect(list.map((meta) => meta.title)).toEqual(["second", "first"]);

    const other = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-other-"));
    expect(await Session.list(other, env)).toEqual([]);
    await fs.rm(other, { recursive: true, force: true });
  });

  it("rewrites the file when history is compacted", async () => {
    const session = await Session.create(cwd, undefined, env);
    await session.append({ role: "user", content: "one" });
    await session.append({ role: "assistant", content: "two" });
    await session.replaceHistory([{ role: "user", content: "summary" }]);

    const reopened = await Session.open(cwd, session.meta.id, env);
    expect(reopened?.history()).toEqual([{ role: "user", content: "summary" }]);
  });

  it("accumulates cost across turns", async () => {
    const session = await Session.create(cwd, undefined, env);
    await session.addCost(0.01);
    await session.addCost(0.02);
    const reopened = await Session.open(cwd, session.meta.id, env);
    expect(reopened?.meta.costUsd).toBeCloseTo(0.03);
  });

  it("returns null for a session that does not exist", async () => {
    expect(await Session.open(cwd, "nope", env)).toBeNull();
  });
});
