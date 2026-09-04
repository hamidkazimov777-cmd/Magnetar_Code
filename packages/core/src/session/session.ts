import fs from "node:fs/promises";
import path from "node:path";
import { projectSessionsDir } from "../paths.js";
import type { Message } from "../providers/types.js";

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  messageCount: number;
  costUsd: number;
}

type Entry =
  { kind: "meta"; meta: SessionMeta } | { kind: "message"; message: Message; at: number };

/** Timestamps must be strictly increasing within a process: two sessions
 *  created in the same millisecond otherwise tie, and `list()` returns them in
 *  an arbitrary order. A fast CI runner hits this; a laptop rarely does. */
let lastStamp = 0;
function stamp(): number {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

/** Append-only JSONL, flushed on every turn. The prototype rewrote a whole
 *  JSON file only at certain points, so a crash mid-task lost the task. */
export class Session {
  private constructor(
    readonly meta: SessionMeta,
    private readonly file: string,
    private readonly messages: Message[],
  ) {}

  static newId(): string {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
  }

  static async create(cwd: string, model?: string, env?: NodeJS.ProcessEnv): Promise<Session> {
    const dir = projectSessionsDir(cwd, env);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const id = Session.newId();
    const now = stamp();
    const meta: SessionMeta = {
      id,
      title: "New session",
      cwd: path.resolve(cwd),
      createdAt: now,
      updatedAt: now,
      model,
      messageCount: 0,
      costUsd: 0,
    };
    const session = new Session(meta, path.join(dir, `${id}.jsonl`), []);
    await session.writeMeta();
    return session;
  }

  static async open(cwd: string, id: string, env?: NodeJS.ProcessEnv): Promise<Session | null> {
    const file = path.join(projectSessionsDir(cwd, env), `${id}.jsonl`);
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return null;

    let meta: SessionMeta | null = null;
    const messages: Message[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Entry;
        // The newest meta line wins: each save appends a fresh one.
        if (entry.kind === "meta") meta = entry.meta;
        else if (entry.kind === "message") messages.push(entry.message);
      } catch {
        // A half-written last line after a hard kill: drop it, keep the rest.
      }
    }
    if (!meta) return null;
    return new Session({ ...meta, messageCount: messages.length }, file, messages);
  }

  /** Newest first, cheap enough to call on every `/sessions`. */
  static async list(cwd: string, env?: NodeJS.ProcessEnv): Promise<SessionMeta[]> {
    const dir = projectSessionsDir(cwd, env);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    const metas: SessionMeta[] = [];
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const session = await Session.open(cwd, name.slice(0, -".jsonl".length), env);
      if (session) metas.push(session.meta);
    }
    // Ties fall back to creation order so the list never shuffles between
    // calls, whatever the clock resolution.
    return metas.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  }

  /** Sessions accumulate forever otherwise, and most of them are empty. */
  static async remove(cwd: string, id: string, env?: NodeJS.ProcessEnv): Promise<void> {
    const file = path.join(projectSessionsDir(cwd, env), `${id}.jsonl`);
    await fs.rm(file, { force: true });
  }

  history(): readonly Message[] {
    return this.messages;
  }

  async append(message: Message): Promise<void> {
    this.messages.push(message);
    this.meta.messageCount = this.messages.length;
    this.meta.updatedAt = stamp();
    // The first user turn names the session, so `/sessions` reads like a list
    // of tasks instead of a list of timestamps.
    if (this.meta.title === "New session" && message.role === "user" && message.content) {
      this.meta.title = titleFrom(message.content);
    }
    await this.write({ kind: "message", message, at: stamp() });
    await this.writeMeta();
  }

  /** Compaction rewrites history, so the file is rebuilt rather than appended. */
  async replaceHistory(messages: Message[]): Promise<void> {
    this.messages.length = 0;
    this.messages.push(...messages);
    this.meta.messageCount = messages.length;
    this.meta.updatedAt = stamp();
    const lines = [
      JSON.stringify({ kind: "meta", meta: this.meta }),
      ...messages.map((message) => JSON.stringify({ kind: "message", message, at: stamp() })),
    ];
    await fs.writeFile(this.file, `${lines.join("\n")}\n`, "utf8");
  }

  async addCost(usd: number): Promise<void> {
    this.meta.costUsd += usd;
    await this.writeMeta();
  }

  private async writeMeta(): Promise<void> {
    await this.write({ kind: "meta", meta: this.meta });
  }

  private async write(entry: Entry): Promise<void> {
    await fs.appendFile(this.file, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

function titleFrom(content: string): string {
  const line = content.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57)}...` : line || "New session";
}
