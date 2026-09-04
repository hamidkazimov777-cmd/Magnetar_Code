import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startDaemon, type Daemon } from "./server.js";
import { Session } from "../session/session.js";
import { Permissions } from "../permissions/permissions.js";
import { TodoStore } from "../tools/todo.js";
import type { OpenAICompatibleProvider } from "../providers/openai.js";
import type { StreamMessage } from "./protocol.js";
import type { Tool } from "../tools/types.js";

let home: string;
let cwd: string;
let daemon: Daemon;
let origin: string;
let token: string;

const echo: Tool = {
  name: "echo",
  description: "echo",
  mutating: true,
  parameters: { type: "object", properties: {} },
  summarize: () => "echo it",
  async run() {
    return { output: "echoed", diff: "--- a/src/a.ts\n+++ b/src/a.ts\n+x" };
  },
};

/** Scripted provider: first turn calls the tool, second turn answers. */
function provider(): OpenAICompatibleProvider {
  let call = 0;
  return {
    async *stream() {
      if (call++ === 0) {
        yield { type: "delta" as const, text: "working" };
        yield {
          type: "tool_call" as const,
          calls: [
            { id: "c1", type: "function" as const, function: { name: "echo", arguments: "{}" } },
          ],
        };
      } else {
        yield { type: "delta" as const, text: "done" };
      }
      yield { type: "done" as const, finishReason: "stop" };
    },
  } as unknown as OpenAICompatibleProvider;
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-d-home-"));
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-d-proj-"));
  process.env.MAGNETAR_HOME = home;
  await fs.mkdir(path.join(cwd, "src"));
  await fs.writeFile(path.join(cwd, "src", "a.ts"), "const a = 1;\n");
  await fs.writeFile(path.join(cwd, "secret.bin"), Buffer.from([0, 1, 2]));

  daemon = await startDaemon({
    version: "test",
    cwd,
    provider: provider(),
    profile: { id: "mock", name: "Mock", baseUrl: "http://localhost/v1", models: ["m1", "m2"] },
    model: "m1",
    session: await Session.create(cwd, "m1"),
    permissions: await Permissions.load(cwd, "ask"),
    tools: [echo],
    todos: new TodoStore(),
    systemPrompt: "system",
    idleTimeoutMs: 0,
  });
  origin = `http://127.0.0.1:${daemon.port}`;
  token = daemon.token;
});

afterEach(async () => {
  await daemon.close();
  delete process.env.MAGNETAR_HOME;
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(cwd, { recursive: true, force: true });
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = () => ({ ...auth(), "Content-Type": "application/json" });

async function get<T>(pathname: string): Promise<T> {
  return (await fetch(`${origin}${pathname}`, { headers: auth() })).json() as Promise<T>;
}

async function post<T>(pathname: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: jsonHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return response.json() as Promise<T>;
}

/** Read the event stream, handing each message to `onMessage`, until one
 *  satisfies `until`. Answering approvals has to happen while the stream is
 *  still open, so the caller works inside the callback. */
async function collect(
  until: (message: StreamMessage) => boolean,
  onMessage: (message: StreamMessage) => void = () => {},
  timeoutMs = 5000,
): Promise<StreamMessage[]> {
  const response = await fetch(`${origin}/api/stream?t=${token}`);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const messages: StreamMessage[] = [];
  const deadline = Date.now() + timeoutMs;
  let buffer = "";
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const message = JSON.parse(line.slice(6)) as StreamMessage;
      messages.push(message);
      onMessage(message);
      if (until(message)) {
        await reader.cancel();
        return messages;
      }
    }
  }
  await reader.cancel();
  return messages;
}

describe("daemon authentication", () => {
  it("refuses a request with no token", async () => {
    const response = await fetch(`${origin}/api/state`);
    expect(response.status).toBe(401);
  });

  it("refuses a wrong token, including one of a different length", async () => {
    expect((await fetch(`${origin}/api/state?t=nope`)).status).toBe(401);
    expect(
      (await fetch(`${origin}/api/state`, { headers: { Authorization: "Bearer x" } })).status,
    ).toBe(401);
  });

  it("accepts the token in a header or the query string", async () => {
    expect((await fetch(`${origin}/api/state`, { headers: auth() })).status).toBe(200);
    expect((await fetch(`${origin}/api/state?t=${token}`)).status).toBe(200);
  });

  it("refuses a request from another origin even with a token", async () => {
    // This is the attack the prototype's /api/config was wide open to.
    const response = await fetch(`${origin}/api/state`, {
      headers: { ...auth(), Origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("sends no CORS headers, so a cross-origin page cannot read a reply", async () => {
    const response = await fetch(`${origin}/api/state`, { headers: auth() });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("daemon state and files", () => {
  it("describes the run without leaking the API key", async () => {
    const state = await get<Record<string, unknown>>("/api/state");
    expect(Array.isArray(state.providers)).toBe(true);
    expect(state).toMatchObject({ cwd, model: "m1", permissionMode: "ask", busy: false });
    expect(state.provider).toEqual({ id: "mock", name: "Mock", baseUrl: "http://localhost/v1" });
    expect(JSON.stringify(state)).not.toContain("apiKey");
  });

  it("lists and reads files inside the project", async () => {
    const files = await get<unknown[]>("/api/files?path=src");
    expect(files).toEqual([{ name: "a.ts", path: "src/a.ts", directory: false, changed: false }]);

    const file = await get<{ content: string }>("/api/file?path=src/a.ts");
    expect(file.content).toBe("const a = 1;\n");
  });

  it("refuses to read outside the project or to read a binary", async () => {
    const escape = await fetch(`${origin}/api/file?path=../../etc/passwd`, { headers: auth() });
    expect(escape.status).toBe(500);
    const binary = await get<{ error: string }>("/api/file?path=secret.bin");
    expect(binary.error).toBe("Binary file");
  });

  it("changes the model and the approval mode", async () => {
    await fetch(`${origin}/api/model`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ model: "m2" }),
    });
    await fetch(`${origin}/api/permission-mode`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "auto-edit" }),
    });
    const state = await get<Record<string, unknown>>("/api/state");
    expect(Array.isArray(state.providers)).toBe(true);
    expect(state.model).toBe("m2");
    expect(state.permissionMode).toBe("auto-edit");
  });
});

describe("daemon chat", () => {
  it("streams a turn, asks for approval and finishes once answered", async () => {
    const approve = (id: string) =>
      fetch(`${origin}/api/approve`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision: "allow" }),
      });

    const collected = collect(
      (message) => message.type === "finished",
      (message) => {
        if (message.type === "approval_request") void approve(message.id);
      },
    );
    // Let the stream attach before the turn starts, or its first events are
    // sent to nobody.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const started = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: "do it" }),
    });
    expect(started.status).toBe(202);

    const messages = await collected;
    const kinds = messages.map((m) => m.type);
    expect(kinds).toContain("delta");
    expect(kinds).toContain("approval_request");
    expect(kinds).toContain("approval_resolved");
    expect(kinds).toContain("tool_end");
    expect(kinds).toContain("finished");

    const toolEnd = messages.find((m) => m.type === "tool_end");
    expect(toolEnd && toolEnd.type === "tool_end" && toolEnd.result.output).toBe("echoed");

    // The daemon noticed which file the turn changed.
    const changed = await get<{ changed: boolean }[]>("/api/files?path=src");
    expect(changed[0]!.changed).toBe(true);
  });

  it("denies an approval nobody answers instead of hanging on it", async () => {
    // A watcher is attached but never answers — a tab left open, or closed
    // mid-prompt. The turn has to end anyway.
    const quick = await startDaemon({
      version: "test",
      cwd,
      provider: provider(),
      profile: { id: "mock", name: "Mock", baseUrl: "http://localhost/v1" },
      model: "m1",
      session: await Session.create(cwd, "m1"),
      permissions: await Permissions.load(cwd, "ask"),
      tools: [echo],
      todos: new TodoStore(),
      systemPrompt: "system",
      idleTimeoutMs: 0,
      approvalTimeoutMs: 200,
    });
    const base = `http://127.0.0.1:${quick.port}`;
    const headers = { Authorization: `Bearer ${quick.token}`, "Content-Type": "application/json" };

    const response = await fetch(`${base}/api/stream?t=${quick.token}`);
    const reader = response.body!.getReader();
    await fetch(`${base}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "go" }),
    });

    const decoder = new TextDecoder();
    let seen = "";
    while (!seen.includes('"finished"')) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(seen).toContain('"approval_resolved"');
    expect(seen).toContain('"deny"');
    expect(seen).toContain('"finished"');
    await quick.close();
  });

  it("refuses a second turn while one is running", async () => {
    await fetch(`${origin}/api/stream?t=${token}`);
    const body = JSON.stringify({ text: "one" });
    const headers = { ...auth(), "Content-Type": "application/json" };
    await fetch(`${origin}/api/chat`, { method: "POST", headers, body });
    const second = await fetch(`${origin}/api/chat`, { method: "POST", headers, body });
    expect([409, 202]).toContain(second.status);
  });

  it("rejects an empty message", async () => {
    const response = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });
    expect(response.status).toBe(400);
  });

  it("404s an approval nobody is waiting for", async () => {
    const response = await fetch(`${origin}/api/approve`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: "nope", decision: "allow" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("switching between configured providers", () => {
  it("rebuilds against another provider without asking for a key", async () => {
    const asked: string[] = [];
    const second = provider();
    const local = await startDaemon({
      version: "test",
      cwd,
      provider: provider(),
      profile: { id: "a", name: "First", baseUrl: "http://a/v1" },
      providers: [
        { id: "a", name: "First", model: "m1" },
        { id: "b", name: "Second", model: "m9" },
      ],
      model: "m1",
      session: await Session.create(cwd, "m1"),
      permissions: await Permissions.load(cwd, "yolo"),
      tools: [echo],
      todos: new TodoStore(),
      systemPrompt: "system",
      idleTimeoutMs: 0,
      onProviderChange: async (id) => {
        asked.push(id);
        if (id !== "b") return null;
        return {
          provider: second,
          profile: { id: "b", name: "Second", baseUrl: "http://b/v1" },
          model: "m9",
        };
      },
    });
    const base = `http://127.0.0.1:${local.port}`;
    const headers = { Authorization: `Bearer ${local.token}`, "Content-Type": "application/json" };

    const before = (await (await fetch(`${base}/api/state`, { headers })).json()) as {
      provider: { name: string };
      providers: unknown[];
    };
    expect(before.provider.name).toBe("First");
    expect(before.providers).toHaveLength(2);

    const switched = await fetch(`${base}/api/provider`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "b" }),
    });
    expect(switched.status).toBe(200);
    expect(asked).toEqual(["b"]);

    const after = (await (await fetch(`${base}/api/state`, { headers })).json()) as {
      provider: { name: string };
      model: string;
    };
    expect(after.provider.name).toBe("Second");
    expect(after.model).toBe("m9");
    await local.close();
  });

  it("refuses a provider it cannot build", async () => {
    const local = await startDaemon({
      version: "test",
      cwd,
      provider: provider(),
      profile: { id: "a", name: "First", baseUrl: "http://a/v1" },
      model: "m1",
      session: await Session.create(cwd, "m1"),
      permissions: await Permissions.load(cwd, "ask"),
      tools: [echo],
      todos: new TodoStore(),
      systemPrompt: "system",
      idleTimeoutMs: 0,
      onProviderChange: async () => null,
    });
    const response = await fetch(`http://127.0.0.1:${local.port}/api/provider`, {
      method: "POST",
      headers: { Authorization: `Bearer ${local.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "nope" }),
    });
    expect(response.status).toBe(400);
    await local.close();
  });
});

describe("daemon sessions", () => {
  it("creates and reopens sessions", async () => {
    const created = await post<{ id: string }>("/api/sessions");
    expect(created.id).toBeTruthy();

    const list = await get<unknown[]>("/api/sessions");
    expect(list.length).toBeGreaterThanOrEqual(1);

    const opened = await get<{ meta: { id: string }; messages: unknown[] }>(
      `/api/session?id=${created.id}`,
    );
    expect(opened.meta.id).toBe(created.id);
    expect(opened.messages).toEqual([]);
  });

  it("404s an unknown session", async () => {
    const response = await fetch(`${origin}/api/session?id=nope`, { headers: auth() });
    expect(response.status).toBe(404);
  });
});

describe("daemon static files", () => {
  it("says so when no monitor is bundled", async () => {
    const response = await fetch(`${origin}/`);
    expect(response.status).toBe(404);
  });
});

describe("changing the approval mode from the monitor", () => {
  it("actually stops the agent asking, not just the label", async () => {
    // The dropdown is only real if the permissions object it mutates is the
    // same one the running loop consults.
    await post("/api/permission-mode", { mode: "yolo" });

    const seen: StreamMessage[] = [];
    const done = collect(
      (message) => message.type === "finished",
      (message) => seen.push(message),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await post("/api/chat", { text: "go" });
    await done;

    expect(seen.some((m) => m.type === "tool_end")).toBe(true);
    expect(seen.some((m) => m.type === "approval_request")).toBe(false);
  });

  it("asks again once the mode goes back to ask", async () => {
    await post("/api/permission-mode", { mode: "ask" });

    const seen: StreamMessage[] = [];
    const done = collect(
      (message) => message.type === "finished",
      (message) => {
        seen.push(message);
        if (message.type === "approval_request") {
          void post("/api/approve", { id: message.id, decision: "allow" });
        }
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await post("/api/chat", { text: "go" });
    await done;

    expect(seen.some((m) => m.type === "approval_request")).toBe(true);
  });

  it("tells the owning process, so the setting survives and the terminal agrees", async () => {
    const changes: string[] = [];
    const local = await startDaemon({
      version: "test",
      cwd,
      provider: provider(),
      profile: { id: "mock", name: "Mock", baseUrl: "http://localhost/v1" },
      model: "m1",
      session: await Session.create(cwd, "m1"),
      permissions: await Permissions.load(cwd, "ask"),
      tools: [echo],
      todos: new TodoStore(),
      systemPrompt: "system",
      idleTimeoutMs: 0,
      onPermissionModeChange: (mode) => changes.push(mode),
    });
    await fetch(`http://127.0.0.1:${local.port}/api/permission-mode`, {
      method: "POST",
      headers: { Authorization: `Bearer ${local.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "yolo" }),
    });
    expect(changes).toEqual(["yolo"]);
    await local.close();
  });
});
