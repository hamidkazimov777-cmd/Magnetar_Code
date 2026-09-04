import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { runAgent, type AgentEvent } from "../agent/loop.js";
import { Session } from "../session/session.js";
import { Permissions, type Approval } from "../permissions/permissions.js";
import { OpenAICompatibleProvider } from "../providers/openai.js";
import { resolveInRoot, isIgnoredDir } from "../tools/sandbox.js";
import { factsDir, globalMemoryFile, readMemory, writeMemory } from "../memory/memory.js";
import { projectMemoryFile } from "../paths.js";
import { MAX_FILE_BYTES, looksBinary } from "../tools/text.js";
import type { PermissionMode } from "../config/types.js";
import type { Tool } from "../tools/types.js";
import type { TodoStore } from "../tools/todo.js";
import {
  EventStream,
  bearerOrQuery,
  json,
  newToken,
  originAllowed,
  readJson,
  tokenMatches,
} from "./http.js";
import type {
  ApproveRequestBody,
  ChatRequestBody,
  FileEntry,
  SessionResponse,
  StateResponse,
  StreamMessage,
} from "./protocol.js";

export interface DaemonDeps {
  version: string;
  cwd: string;
  provider: OpenAICompatibleProvider;
  profile: { id: string; name: string; baseUrl: string; models?: string[] };
  model: string;
  session: Session;
  permissions: Permissions;
  tools: Tool[];
  todos: TodoStore;
  systemPrompt: string;
  maxSteps?: number;
  /** Serve the built monitor from here, when it is present. */
  staticDir?: string;
  /** Shut down after this long with no client connected. 0 keeps it running. */
  idleTimeoutMs?: number;
  /** Told when the monitor changes the approval mode, so the process that owns
   *  the config can persist it and update what the terminal is showing. Without
   *  this the two surfaces disagree about a security setting. */
  onPermissionModeChange?: (mode: PermissionMode) => void;
  /** Deny an approval nobody has answered after this long. A daemon must not
   *  sit on a half-finished turn forever because a tab was closed. */
  approvalTimeoutMs?: number;
}

export interface Daemon {
  url: string;
  token: string;
  port: number;
  close: () => Promise<void>;
}

const DEFAULT_IDLE_MS = 5 * 60_000;
const DEFAULT_APPROVAL_MS = 10 * 60_000;

/** A loopback HTTP server that owns the agent, so the browser never sees an
 *  API key and never talks to a provider itself. */
export async function startDaemon(deps: DaemonDeps): Promise<Daemon> {
  const token = newToken();
  let session = deps.session;
  let model = deps.model;
  let busy = false;
  let abort: AbortController | null = null;

  const clients = new Set<EventStream>();
  const pendingApprovals = new Map<
    string,
    { resolve: (answer: Approval) => void; timer: NodeJS.Timeout }
  >();
  const changedFiles = new Set<string>();
  /** The current turn's messages, replayed to a client that connects while it
   *  is already running — SSE has no history, and opening the monitor
   *  mid-task should not show an empty screen. */
  let turnLog: StreamMessage[] = [];
  let idleTimer: NodeJS.Timeout | null = null;

  const server = http.createServer((req, res) => {
    void handle(req, res).catch((error: Error) => {
      if (!res.headersSent) json(res, 500, { error: error.message });
      else res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;

  const idleMs = deps.idleTimeoutMs ?? DEFAULT_IDLE_MS;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleMs <= 0) return;
    // Only counts while nobody is watching: a browser tab left open holds a
    // stream, and a running agent must not be killed underneath it.
    if (clients.size > 0 || busy) return;
    idleTimer = setTimeout(() => void close(), idleMs);
  };
  resetIdle();

  async function close(): Promise<void> {
    if (idleTimer) clearTimeout(idleTimer);
    abort?.abort();
    denyAllPending();
    for (const client of clients) client.end();
    clients.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  function broadcast(message: StreamMessage): void {
    turnLog.push(message);
    if (turnLog.length > 1000) turnLog = turnLog.slice(-500);
    for (const client of clients) client.send(message);
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", origin);

    if (!url.pathname.startsWith("/api/")) {
      return serveStatic(url.pathname, res);
    }
    if (!originAllowed(req, origin)) return json(res, 403, { error: "Bad origin" });
    if (!tokenMatches(token, bearerOrQuery(req, url))) {
      return json(res, 401, { error: "Bad or missing token" });
    }

    switch (`${req.method} ${url.pathname}`) {
      case "GET /api/state":
        return json(res, 200, await state());

      case "GET /api/sessions":
        return json(res, 200, await Session.list(deps.cwd));

      case "POST /api/sessions": {
        session = await Session.create(deps.cwd, model);
        return json(res, 200, session.meta);
      }

      case "GET /api/session": {
        const id = url.searchParams.get("id");
        const target = id ? await Session.open(deps.cwd, id) : session;
        if (!target) return json(res, 404, { error: "No such session" });
        if (id) session = target;
        const body: SessionResponse = { meta: target.meta, messages: [...target.history()] };
        return json(res, 200, body);
      }

      case "DELETE /api/session": {
        const id = url.searchParams.get("id");
        if (!id) return json(res, 400, { error: "id is required" });
        // Deleting the session you are in would leave the run writing to a
        // file nobody can open; start a fresh one instead.
        if (id === session.meta.id) session = await Session.create(deps.cwd, model);
        await Session.remove(deps.cwd, id);
        return json(res, 200, { ok: true });
      }

      case "GET /api/memory":
        return json(res, 200, await readMemory(deps.cwd));

      case "POST /api/memory": {
        const body = await readJson<{ file: string; content: string }>(req);
        if (!memoryWritable(body.file)) return json(res, 403, { error: "Not a memory file" });
        await writeMemory(body.file, body.content ?? "");
        return json(res, 200, await readMemory(deps.cwd));
      }

      case "GET /api/files":
        return json(res, 200, await listFiles(url.searchParams.get("path") ?? "."));

      case "GET /api/file":
        return json(res, 200, await readTextFile(url.searchParams.get("path") ?? ""));

      case "POST /api/model": {
        const body = await readJson<{ model: string }>(req);
        if (typeof body.model === "string" && body.model) model = body.model;
        return json(res, 200, { model });
      }

      case "POST /api/permission-mode": {
        const body = await readJson<{ mode: PermissionMode }>(req);
        deps.permissions.setMode(body.mode);
        deps.onPermissionModeChange?.(body.mode);
        return json(res, 200, { mode: body.mode });
      }

      case "POST /api/approve": {
        const body = await readJson<ApproveRequestBody>(req);
        const pending = pendingApprovals.get(body.id);
        if (!pending) return json(res, 404, { error: "No pending approval with that id" });
        settleApproval(body.id, body.decision);
        return json(res, 200, { ok: true });
      }

      case "POST /api/cancel":
        abort?.abort();
        return json(res, 200, { ok: true });

      case "GET /api/stream": {
        const stream = new EventStream(res);
        for (const message of turnLog) stream.send(message);
        clients.add(stream);
        resetIdle();
        // A tab that is left open must not be dropped by a proxy or by Node's
        // own idle socket handling.
        const ping = setInterval(() => stream.send({ type: "notice", text: "" }), 25_000);
        req.on("close", () => {
          clearInterval(ping);
          clients.delete(stream);
          stream.end();
          // The last watcher leaving means nobody can answer an open prompt.
          if (clients.size === 0) denyAllPending();
          resetIdle();
        });
        return;
      }

      case "POST /api/chat": {
        if (busy) return json(res, 409, { error: "A turn is already running" });
        const body = await readJson<ChatRequestBody>(req);
        if (typeof body.text !== "string" || !body.text.trim()) {
          return json(res, 400, { error: "text is required" });
        }
        json(res, 202, { ok: true });
        void runTurn(body.text.trim());
        return;
      }

      default:
        return json(res, 404, { error: "Not found" });
    }
  }

  function settleApproval(id: string, decision: Approval): void {
    const pending = pendingApprovals.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingApprovals.delete(id);
    pending.resolve(decision);
    broadcast({ type: "approval_resolved", id, decision });
  }

  function denyAllPending(): void {
    for (const id of [...pendingApprovals.keys()]) settleApproval(id, "deny");
  }

  async function runTurn(text: string): Promise<void> {
    busy = true;
    turnLog = [];
    abort = new AbortController();
    const controller = abort;
    try {
      const result = await runAgent(text, {
        provider: deps.provider,
        model,
        tools: deps.tools,
        permissions: deps.permissions,
        session,
        cwd: deps.cwd,
        systemPrompt: deps.systemPrompt,
        maxSteps: deps.maxSteps,
        signal: controller.signal,
        onEvent: (event: AgentEvent) => {
          if (event.type === "tool_end" && event.result.diff) {
            const match = /^--- a\/(.+)$/m.exec(event.result.diff);
            if (match) changedFiles.add(match[1]!);
          }
          broadcast(event);
        },
        requestApproval: ({ tool, summary }) =>
          new Promise<Approval>((resolve) => {
            const id = `ap_${Math.random().toString(36).slice(2, 10)}`;
            const timer = setTimeout(
              () => settleApproval(id, "deny"),
              deps.approvalTimeoutMs ?? DEFAULT_APPROVAL_MS,
            );
            // Do not keep the process alive just to wait for a click.
            timer.unref?.();
            pendingApprovals.set(id, { resolve, timer });
            broadcast({
              type: "approval_request",
              id,
              tool: tool.name,
              summary,
              mutating: tool.mutating,
            });
            // Nobody watching means nobody can answer; denying beats hanging.
            if (clients.size === 0) settleApproval(id, "deny");
          }),
      });
      broadcast({
        type: "finished",
        stopReason: result.stopReason,
        steps: result.steps,
        costUsd: result.costUsd,
        ...(result.error ? { error: result.error.message } : {}),
      });
    } finally {
      busy = false;
      abort = null;
      denyAllPending();
      resetIdle();
    }
  }

  async function state(): Promise<StateResponse> {
    return {
      version: deps.version,
      cwd: deps.cwd,
      provider: { id: deps.profile.id, name: deps.profile.name, baseUrl: deps.profile.baseUrl },
      model,
      models: deps.profile.models ?? [],
      permissionMode: deps.permissions.getMode(),
      session: session.meta,
      sessions: await Session.list(deps.cwd),
      todos: deps.todos.list(),
      busy,
    };
  }

  /** Only the three places memory lives. Everything else is a plain file and
   *  belongs to the agent's own tools, which have their own approval path. */
  function memoryWritable(file: string): boolean {
    if (typeof file !== "string" || !file) return false;
    const target = path.resolve(file);
    if (target === globalMemoryFile()) return true;
    if (target === projectMemoryFile(deps.cwd)) return true;
    const facts = factsDir(deps.cwd);
    return target.startsWith(`${facts}${path.sep}`) && target.endsWith(".md");
  }

  async function listFiles(relative: string): Promise<FileEntry[]> {
    const target = resolveInRoot(deps.cwd, relative);
    const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => !entry.name.startsWith("."))
      .filter((entry) => !(entry.isDirectory() && isIgnoredDir(entry.name)))
      .map((entry) => {
        const full = path.join(relative === "." ? "" : relative, entry.name);
        return {
          name: entry.name,
          path: full,
          directory: entry.isDirectory(),
          changed: changedFiles.has(full),
        };
      })
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  }

  async function readTextFile(relative: string): Promise<{ path: string; content: string }> {
    const target = resolveInRoot(deps.cwd, relative);
    const stat = await fs.stat(target);
    if (stat.size > MAX_FILE_BYTES) throw new Error("File is too large to display");
    const buffer = await fs.readFile(target);
    if (looksBinary(buffer)) throw new Error("Binary file");
    return { path: relative, content: buffer.toString("utf8") };
  }

  /** The monitor's own assets. Paths are resolved inside the build directory
   *  for the same reason tool paths are resolved inside the project. */
  async function serveStatic(pathname: string, res: http.ServerResponse): Promise<void> {
    if (!deps.staticDir) return json(res, 404, { error: "No monitor bundled in this install" });
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    let file: string;
    try {
      file = resolveInRoot(deps.staticDir, relative);
    } catch {
      return json(res, 403, { error: "Forbidden" });
    }
    const content = await fs.readFile(file).catch(() => null);
    if (!content) return json(res, 404, { error: "Not found" });
    res.writeHead(200, {
      "Content-Type": contentType(file),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(content);
  }

  return { url: `${origin}/?t=${token}`, token, port, close };
}

function contentType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };
  return types[extension] ?? "application/octet-stream";
}
