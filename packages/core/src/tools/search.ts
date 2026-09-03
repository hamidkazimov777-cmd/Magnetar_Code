import fs from "node:fs/promises";
import path from "node:path";
import { isIgnoredDir, resolveInRoot } from "./sandbox.js";
import { globToRegExp } from "./glob.js";
import { MAX_FILE_BYTES, looksBinary, truncate } from "./text.js";
import { optStr, str, type Tool, type ToolContext } from "./types.js";

const MAX_FILES = 20_000;

/** Depth-first walk that honours the ignore list and the abort signal. Paths
 *  come back relative to the root and with forward slashes, so globs written
 *  by the model behave the same on every platform. */
async function* walk(
  root: string,
  ctx: ToolContext,
  dir = root,
  budget = { count: 0 },
): AsyncGenerator<string, void, unknown> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (ctx.signal?.aborted) return;
    if (budget.count >= MAX_FILES) return;
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      yield* walk(root, ctx, full, budget);
    } else if (entry.isFile()) {
      budget.count++;
      yield path.relative(root, full).split(path.sep).join("/");
    }
  }
}

export const glob: Tool = {
  name: "glob",
  description:
    "Find files by path pattern, e.g. 'src/**/*.ts'. Faster and cheaper than shelling out to find.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob relative to the project root" },
      path: { type: "string", description: "Directory to search in (default: project root)" },
    },
    required: ["pattern"],
  },
  summarize: (args) => String(args.pattern ?? ""),
  async run(args, ctx) {
    const base = resolveInRoot(ctx.cwd, optStr(args, "path") ?? ".");
    const regexp = globToRegExp(str(args, "pattern"));
    const matches: string[] = [];
    for await (const file of walk(base, ctx)) {
      if (regexp.test(file)) matches.push(file);
      if (matches.length >= 500) break;
    }
    if (matches.length === 0) return { output: "No files matched." };
    return { output: truncate(matches.sort().join("\n")) };
  },
};

export const grep: Tool = {
  name: "grep",
  description:
    "Search file contents with a regular expression. Returns matching lines with their file and line number.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "JavaScript regular expression" },
      path: { type: "string", description: "Directory to search in (default: project root)" },
      include: { type: "string", description: "Only search files matching this glob, e.g. '*.ts'" },
    },
    required: ["pattern"],
  },
  summarize: (args) => String(args.pattern ?? ""),
  async run(args, ctx) {
    const base = resolveInRoot(ctx.cwd, optStr(args, "path") ?? ".");
    let regexp: RegExp;
    try {
      regexp = new RegExp(str(args, "pattern"));
    } catch (error) {
      return { output: `Invalid regular expression: ${(error as Error).message}`, isError: true };
    }
    const includePattern = optStr(args, "include");
    const include = includePattern ? globToRegExp(includePattern) : null;

    const hits: string[] = [];
    let scanned = 0;
    for await (const file of walk(base, ctx)) {
      if (ctx.signal?.aborted) break;
      // A bare '*.ts' should match at any depth, which is what the model means.
      if (include && !include.test(file) && !include.test(path.basename(file))) continue;
      const full = path.join(base, file);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat || stat.size > MAX_FILE_BYTES) continue;
      const buffer = await fs.readFile(full).catch(() => null);
      if (!buffer || looksBinary(buffer)) continue;
      scanned++;
      const lines = buffer.toString("utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regexp.test(lines[i]!)) {
          hits.push(`${file}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
          if (hits.length >= 200) break;
        }
      }
      if (hits.length >= 200) break;
    }
    if (hits.length === 0) return { output: `No matches in ${scanned} files.` };
    return { output: truncate(hits.join("\n")) };
  },
};
