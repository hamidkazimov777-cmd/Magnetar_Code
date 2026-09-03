import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAgent, type AgentEvent } from "./loop.js";
import { estimateCost, priceFor, formatCost, estimateTokens } from "./cost.js";
import { compact, shouldCompact, transcriptTokens } from "./compact.js";
import { Session } from "../session/session.js";
import { Permissions } from "../permissions/permissions.js";
import { OpenAICompatibleProvider } from "../providers/openai.js";
import type { Message, ToolCall } from "../providers/types.js";
import type { Tool } from "../tools/types.js";

describe("cost", () => {
  it("prefers the longest matching model key", () => {
    expect(priceFor("openai/gpt-5-mini")?.input).toBe(0.25);
    expect(priceFor("gpt-5")?.input).toBe(1.25);
  });
  it("reports nothing for an unknown model rather than guessing", () => {
    expect(priceFor("some-local-model")).toBeNull();
    expect(estimateCost("some-local-model", { inputTokens: 1000, outputTokens: 1000 })).toBe(0);
  });
  it("prices a real usage figure", () => {
    expect(estimateCost("gpt-4o", { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(2.5);
  });
  it("formats small amounts without rounding them to zero", () => {
    expect(formatCost(0.0004)).toBe("$0.0004");
    expect(formatCost(1.5)).toBe("$1.50");
    expect(estimateTokens("abcd")).toBe(1);
  });
});

/** A provider stand-in: hands back scripted turns instead of calling out. */
function scriptedProvider(turns: { text?: string; calls?: ToolCall[] }[]) {
  let index = 0;
  const seen: Message[][] = [];
  const provider = {
    seen,
    async *stream(request: { messages: Message[] }) {
      seen.push(request.messages);
      const turn = turns[Math.min(index++, turns.length - 1)]!;
      if (turn.text) yield { type: "delta" as const, text: turn.text };
      yield { type: "usage" as const, usage: { inputTokens: 100, outputTokens: 10 } };
      if (turn.calls) yield { type: "tool_call" as const, calls: turn.calls };
      yield { type: "done" as const, finishReason: turn.calls ? "tool_calls" : "stop" };
    },
    async complete() {
      return "a summary of the earlier work";
    },
  };
  return provider as unknown as OpenAICompatibleProvider & { seen: Message[][] };
}

function call(name: string, args: unknown, id = "c1"): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

describe("runAgent", () => {
  let home: string;
  let cwd: string;
  let env: NodeJS.ProcessEnv;
  let session: Session;
  let events: AgentEvent[];

  const echoTool: Tool = {
    name: "echo",
    description: "echo",
    mutating: false,
    parameters: { type: "object", properties: { text: { type: "string" } } },
    summarize: (args) => String(args.text),
    async run(args) {
      return { output: `echoed ${String(args.text)}` };
    },
  };
  const dangerTool: Tool = { ...echoTool, name: "danger", mutating: true };

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-home-"));
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-proj-"));
    env = { MAGNETAR_HOME: home } as NodeJS.ProcessEnv;
    session = await Session.create(cwd, "gpt-4o", env);
    events = [];
  });
  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(cwd, { recursive: true, force: true });
  });

  const base = () => ({
    model: "gpt-4o",
    tools: [echoTool, dangerTool],
    session,
    cwd,
    systemPrompt: "system",
    onEvent: (event: AgentEvent) => events.push(event),
  });

  it("runs a tool and feeds the result back", async () => {
    const provider = scriptedProvider([
      { calls: [call("echo", { text: "hi" })] },
      { text: "all done" },
    ]);
    const result = await runAgent("do it", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
    });

    expect(result.stopReason).toBe("done");
    expect(result.steps).toBe(2);
    expect(session.history().map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(session.history()[2]!.content).toBe("echoed hi");
    // The second request must carry the tool result back to the model.
    expect(provider.seen[1]!.at(-1)!.role).toBe("tool");
  });

  it("charges for usage and reports it", async () => {
    const provider = scriptedProvider([{ text: "hello" }]);
    const result = await runAgent("hi", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
    });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 10 });
    expect(result.costUsd).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "usage")).toBe(true);
  });

  it("stops at the step limit instead of looping forever", async () => {
    // A model that only ever asks for another tool call — the runaway the
    // prototype had no defence against.
    const provider = scriptedProvider([{ calls: [call("echo", { text: "again" })] }]);
    const result = await runAgent("loop", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
      maxSteps: 3,
    });
    expect(result.stopReason).toBe("max_steps");
    expect(result.steps).toBe(3);
    expect(events.some((e) => e.type === "notice" && e.text.includes("3 steps"))).toBe(true);
  });

  it("asks before a mutating tool and tells the model when denied", async () => {
    const provider = scriptedProvider([{ calls: [call("danger", { text: "x" })] }, { text: "ok" }]);
    let asked = 0;
    await runAgent("go", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
      requestApproval: async () => {
        asked++;
        return "deny";
      },
    });
    expect(asked).toBe(1);
    expect(session.history()[2]!.content).toMatch(/denied/i);
  });

  it("remembers an always answer so the second call runs unasked", async () => {
    const provider = scriptedProvider([
      { calls: [call("danger", { text: "x" })] },
      { calls: [call("danger", { text: "y" }, "c2")] },
      { text: "done" },
    ]);
    let asked = 0;
    await runAgent("go", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
      requestApproval: async () => {
        asked++;
        return "always";
      },
    });
    expect(asked).toBe(1);
  });

  it("does not ask at all in yolo mode", async () => {
    const provider = scriptedProvider([{ calls: [call("danger", { text: "x" })] }, { text: "ok" }]);
    let asked = 0;
    await runAgent("go", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "yolo"),
      requestApproval: async () => {
        asked++;
        return "allow";
      },
    });
    expect(asked).toBe(0);
  });

  it("answers every tool call even when one is unknown or malformed", async () => {
    const provider = scriptedProvider([
      {
        calls: [
          { id: "a", type: "function", function: { name: "echo", arguments: "{oops" } },
          call("nosuchtool", {}, "b"),
        ],
      },
      { text: "recovered" },
    ]);
    const result = await runAgent("go", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
    });
    expect(result.stopReason).toBe("done");
    const tools = session.history().filter((m) => m.role === "tool");
    expect(tools.map((m) => m.tool_call_id)).toEqual(["a", "b"]);
    expect(tools[0]!.content).toMatch(/valid JSON/);
    expect(tools[1]!.content).toMatch(/Unknown tool/);
  });

  it("stops when the run is cancelled", async () => {
    const controller = new AbortController();
    const provider = scriptedProvider([{ calls: [call("echo", { text: "x" })] }]);
    controller.abort();
    const result = await runAgent("go", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
      signal: controller.signal,
    });
    expect(result.stopReason).toBe("cancelled");
  });

  it("stops once the budget is spent", async () => {
    const provider = scriptedProvider([{ calls: [call("echo", { text: "x" })] }]);
    const result = await runAgent("go", {
      ...base(),
      provider,
      permissions: await Permissions.load(cwd, "ask"),
      maxCostUsd: 0.0001,
    });
    expect(result.stopReason).toBe("budget");
  });
});

describe("compaction", () => {
  const long = (role: Message["role"], size: number): Message => ({
    role,
    content: "x".repeat(size),
  });

  it("leaves a short transcript alone", () => {
    expect(shouldCompact([long("user", 100), long("assistant", 100)])).toBe(false);
  });

  it("triggers once the transcript is large", () => {
    const messages = Array.from({ length: 20 }, () => long("user", 20_000));
    expect(transcriptTokens(messages)).toBeGreaterThan(60_000);
    expect(shouldCompact(messages)).toBe(true);
  });

  it("replaces the head with a summary and keeps the tail", async () => {
    const messages: Message[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const provider = scriptedProvider([]);
    const result = await compact(messages, provider, "gpt-4o");

    expect(result[0]!.content).toContain("[Earlier in this session]");
    expect(result[0]!.content).toContain("a summary of the earlier work");
    expect(result.length).toBeLessThan(messages.length);
    expect(result.at(-1)).toEqual(messages.at(-1));
  });

  it("never starts the kept tail with an orphaned tool result", async () => {
    const messages: Message[] = [
      ...Array.from({ length: 20 }, (_, i): Message => ({ role: "user", content: `old ${i}` })),
      { role: "tool", tool_call_id: "c1", name: "echo", content: "result" },
      { role: "assistant", content: "after" },
    ];
    const provider = scriptedProvider([]);
    const result = await compact(messages, provider, "gpt-4o");
    expect(result[1]!.role).not.toBe("tool");
  });

  it("keeps the original history when summarisation comes back empty", async () => {
    const messages: Message[] = Array.from({ length: 30 }, () => long("user", 10));
    const provider = {
      async complete() {
        return "  ";
      },
    } as unknown as OpenAICompatibleProvider;
    expect(await compact(messages, provider, "m")).toEqual(messages);
  });
});
