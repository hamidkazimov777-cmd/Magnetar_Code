import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { render } from "ink-testing-library";
import {
  DEFAULT_CONFIG,
  OpenAICompatibleProvider,
  Permissions,
  Session,
  TodoStore,
  defaultTools,
} from "@magnetar/core";
import { App } from "./app.js";
import type { Runtime } from "./runtime.js";

const ENTER = "\r";
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

/** A provider that answers from a script, so the app can be driven end to end
 *  without a network or a key. */
function fakeProvider(frames: string[]): OpenAICompatibleProvider {
  let call = 0;
  return {
    async *stream() {
      const body = frames[Math.min(call++, frames.length - 1)]!;
      yield { type: "delta" as const, text: body };
      yield { type: "usage" as const, usage: { inputTokens: 10, outputTokens: 5 } };
      yield { type: "done" as const, finishReason: "stop" };
    },
    async listModels() {
      return ["mock-1", "mock-2"];
    },
    async complete() {
      return "";
    },
  } as unknown as OpenAICompatibleProvider;
}

let home: string;
let cwd: string;
let runtime: Runtime;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-app-home-"));
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-app-proj-"));
  process.env.MAGNETAR_HOME = home;
  const todos = new TodoStore();
  runtime = {
    config: { ...DEFAULT_CONFIG, providers: [] },
    profile: { id: "mock", name: "Mock", baseUrl: "http://localhost/v1", model: "mock-1" },
    provider: fakeProvider(["The answer is **42**."]),
    model: "mock-1",
    session: await Session.create(cwd, "mock-1"),
    permissions: await Permissions.load(cwd, "ask"),
    tools: defaultTools({ todos }),
    todos,
    systemPrompt: "system",
    cwd,
  };
});

afterEach(async () => {
  delete process.env.MAGNETAR_HOME;
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(cwd, { recursive: true, force: true });
});

const app = () => render(<App runtime={runtime} version="0.1.0" maxSteps={5} />);

describe("App", () => {
  it("opens with the banner and the provider it will use", async () => {
    const { frames, lastFrame } = app();
    await tick();
    // The banner is a <Static> item: painted once, then out of the live frame.
    const painted = frames.join("\n");
    expect(painted).toContain("\u2588\u2580\u2584\u2580\u2588"); // the wordmark's first glyphs
    expect(painted).toContain("Mock");
    expect(lastFrame()).toContain("mock-1");
    expect(lastFrame()).toContain("ask");
  });

  it("shows the command palette as soon as a slash is typed", async () => {
    const { stdin, lastFrame } = app();
    await tick();
    stdin.write("/co");
    await tick();
    expect(lastFrame()).toContain("/cost");
    expect(lastFrame()).toContain("/context");
  });

  it("answers a question and keeps the transcript", async () => {
    const { stdin, lastFrame } = app();
    await tick();
    stdin.write("what is the answer");
    await tick();
    stdin.write(ENTER);
    await tick(200);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("what is the answer");
    expect(frame).toContain("42");
    expect(runtime.session.history().map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("runs a slash command instead of sending it to the model", async () => {
    const { stdin, lastFrame } = app();
    await tick();
    stdin.write("/help");
    await tick();
    stdin.write(ENTER);
    await tick(150);
    expect(lastFrame()).toContain("ctrl+c twice");
    // Nothing was sent to the provider.
    expect(runtime.session.history()).toHaveLength(0);
  });

  it("opens the model picker from /model", async () => {
    const { stdin, lastFrame } = app();
    await tick();
    stdin.write("/model");
    await tick();
    stdin.write(ENTER);
    await tick(150);
    expect(lastFrame()).toContain("mock-2");
  });
});
