import fs from "node:fs/promises";
import path from "node:path";
import { isIgnoredDir } from "./sandbox.js";
import { MAX_FILE_BYTES, looksBinary } from "./text.js";

const MAX_FILES = 20_000;
const CONCURRENCY = 50;

export interface SymbolInfo {
  name: string;
  line: number;
  kind: string;
  context: string;
}

export interface FileIndex {
  path: string;
  size: number;
  lines: number;
  mtime: number;
  header: string;
  symbols: SymbolInfo[];
}

export interface RepoIndex {
  version: 1;
  files: Record<string, FileIndex>;
}

function extractSymbols(content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes("export ")) continue;

    let match = line.match(/export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/);
    if (match) {
      symbols.push({
        name: match[1]!,
        line: i + 1,
        kind: "const",
        context: line.trim().slice(0, 100),
      });
      continue;
    }
    match = line.match(/export\s+(?:async\s+)?function\s+(?:\*\s*)?([a-zA-Z0-9_$]+)/);
    if (match) {
      symbols.push({
        name: match[1]!,
        line: i + 1,
        kind: "function",
        context: line.trim().slice(0, 100),
      });
      continue;
    }
    match = line.match(/export\s+(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/);
    if (match) {
      symbols.push({
        name: match[1]!,
        line: i + 1,
        kind: "class",
        context: line.trim().slice(0, 100),
      });
      continue;
    }
    match = line.match(/export\s+(?:type|interface)\s+([a-zA-Z0-9_$]+)/);
    if (match) {
      symbols.push({
        name: match[1]!,
        line: i + 1,
        kind: "type",
        context: line.trim().slice(0, 100),
      });
      continue;
    }
  }
  return symbols;
}

async function processFile(root: string, relPath: string): Promise<FileIndex | null> {
  const fullPath = path.join(root, relPath);
  try {
    const stat = await fs.stat(fullPath);
    if (stat.size > MAX_FILE_BYTES) return null;

    const buffer = await fs.readFile(fullPath);
    if (looksBinary(buffer)) return null;

    const content = buffer.toString("utf8");
    const header = content.slice(0, 400);
    const symbols = extractSymbols(content);
    const lines = content.split("\n").length;

    return {
      path: relPath,
      size: stat.size,
      lines,
      mtime: stat.mtimeMs,
      header,
      symbols,
    };
  } catch {
    return null;
  }
}

async function* walk(
  root: string,
  dir: string,
  signal?: AbortSignal,
  budget = { count: 0 },
): AsyncGenerator<string, void, unknown> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (signal?.aborted) return;
    if (budget.count >= MAX_FILES) return;
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      yield* walk(root, full, signal, budget);
    } else if (entry.isFile()) {
      budget.count++;
      yield path.relative(root, full).split(path.sep).join("/");
    }
  }
}

export async function buildIndex(cwd: string, signal?: AbortSignal): Promise<RepoIndex> {
  const indexDir = path.join(cwd, ".magnetar");
  const indexPath = path.join(indexDir, "index.json");

  let index: RepoIndex = { version: 1, files: {} };
  try {
    const content = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(content);
    if (parsed.version === 1 && typeof parsed.files === "object") {
      index = parsed as RepoIndex;
    }
  } catch {
    // If it fails or does not exist, we just start fresh
  }

  const newFiles: Record<string, FileIndex> = {};
  const queue: string[] = [];

  for await (const file of walk(cwd, cwd, signal)) {
    queue.push(file);
  }

  let i = 0;
  while (i < queue.length) {
    if (signal?.aborted) break;
    const batch = queue.slice(i, i + CONCURRENCY);
    i += CONCURRENCY;

    await Promise.all(
      batch.map(async (file) => {
        if (signal?.aborted) return;
        const fullPath = path.join(cwd, file);
        const stat = await fs.stat(fullPath).catch(() => null);
        if (!stat) return;

        const existing = index.files[file];
        if (existing && existing.mtime === stat.mtimeMs) {
          newFiles[file] = existing;
          return;
        }

        const indexed = await processFile(cwd, file);
        if (indexed) {
          newFiles[file] = indexed;
        }
      }),
    );
  }

  if (signal?.aborted) {
    return { version: 1, files: newFiles }; // Return partial if aborted
  }

  index.files = newFiles;

  try {
    await fs.mkdir(indexDir, { recursive: true });
    const tempPath = indexPath + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(index));
    await fs.rename(tempPath, indexPath);
  } catch (err) {
    // Cannot write, but we can still return in-memory index
  }

  return index;
}
