import fs from "node:fs/promises";
import path from "node:path";
import { isIgnoredDir, resolveInRoot } from "./sandbox.js";
import { globToRegExp } from "./glob.js";
import { MAX_FILE_BYTES, looksBinary, truncate } from "./text.js";
import { optStr, str, optNum, type Tool, type ToolContext } from "./types.js";
import { buildIndex } from "./index-repo.js";

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

/** Prose still gets indexed — a README often names the thing you are looking
 *  for — but it loses to source when both match. */
const PROSE = /\.(md|mdx|txt|rst|adoc)$/i;

/** An import line answers no question the searcher asked. Neither does a blank
 *  line or a closing brace. */
function isMeaningful(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  if (/^(import|export \*|from|require\()/.test(trimmed)) return false;
  if (/^[)\]},;]/.test(trimmed)) return false;
  return true;
}

/** What a file is, in one line: its first declaration if it has one, else the
 *  first line that says something. */
function firstMeaningful(info: {
  header: string;
  symbols: { name: string; line: number; context: string }[];
}): { line: number; symbol: string; context: string } | null {
  const declared = info.symbols[0];
  if (declared) {
    return { line: declared.line, symbol: declared.name, context: declared.context };
  }
  const lines = info.header.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (isMeaningful(lines[i]!)) {
      return { line: i + 1, symbol: "", context: lines[i]!.trim().slice(0, 100) };
    }
  }
  return null;
}

export const find_code: Tool = {
  name: "find_code",
  description:
    "Semantic search over the project. Use this BEFORE grep to find where a concept or symbol is implemented. Ranks exact symbol matches highest, then partial symbols, paths, file headers, and finally file bodies.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Symbol name, keyword, or concept to search for" },
      limit: { type: "number", description: "Max number of results (default 20)" },
    },
    required: ["query"],
  },
  summarize: (args) => String(args.query ?? ""),
  async run(args, ctx) {
    const query = str(args, "query");
    if (!query) return { output: "Empty query." };
    const limit = optNum(args, "limit") ?? 20;

    const index = await buildIndex(ctx.cwd, ctx.signal);
    if (ctx.signal?.aborted) return { output: "Aborted." };

    interface ScoredHit {
      path: string;
      line: number;
      symbol: string;
      context: string;
      score: number;
    }
    const hits: ScoredHit[] = [];

    const lowerQuery = query.toLowerCase();
    const queryTerms = lowerQuery.split(/[^a-z0-9]+/).filter(Boolean);

    /** The tool is called find_code. Documentation that mentions a symbol is
     *  worth showing, but never above the file that defines it. */
    const weight = (file: string) => (PROSE.test(file) ? 0.4 : 1);

    for (const [file, info] of Object.entries(index.files)) {
      if (ctx.signal?.aborted) break;
      const lowerPath = file.toLowerCase();

      let fileBestScore = 0;
      let fileBestHit: ScoredHit | null = null;

      for (const sym of info.symbols) {
        let score = 0;
        const lowerSym = sym.name.toLowerCase();
        if (sym.name === query) {
          score = 100;
        } else if (lowerSym.includes(lowerQuery)) {
          score = 50;
        } else if (queryTerms.length > 1 && queryTerms.every((t) => lowerSym.includes(t))) {
          score = 30;
        }

        score *= weight(file);
        if (score > fileBestScore) {
          fileBestScore = score;
          fileBestHit = {
            path: file,
            line: sym.line,
            symbol: sym.name,
            context: sym.context,
            score,
          };
        }
      }

      if (fileBestScore === 0) {
        if (
          lowerPath.includes(lowerQuery) ||
          (queryTerms.length > 0 && queryTerms.every((t) => lowerPath.includes(t)))
        ) {
          // Matching on the path tells the model nothing it did not already
          // know, so show what the file actually declares.
          const first = firstMeaningful(info);
          fileBestScore = 20 * weight(file);
          fileBestHit = {
            path: file,
            line: first?.line ?? 0,
            symbol: first?.symbol ?? "",
            context: first?.context ?? "",
            score: fileBestScore,
          };
        } else if (
          info.header.toLowerCase().includes(lowerQuery) ||
          (queryTerms.length > 0 && queryTerms.every((t) => info.header.toLowerCase().includes(t)))
        ) {
          const matched = info.header
            .split("\n")
            .map((line, offset) => ({ line, offset }))
            .find(
              ({ line }) =>
                isMeaningful(line) &&
                (line.toLowerCase().includes(lowerQuery) ||
                  queryTerms.some((term) => line.toLowerCase().includes(term))),
            );
          const first = matched ?? null;
          fileBestScore = 10 * weight(file);
          fileBestHit = {
            path: file,
            line: first ? first.offset + 1 : (firstMeaningful(info)?.line ?? 0),
            symbol: "",
            context: first
              ? first.line.trim().slice(0, 100)
              : (firstMeaningful(info)?.context ?? ""),
            score: fileBestScore,
          };
        }
      }

      if (fileBestHit && fileBestScore > 0) {
        hits.push(fileBestHit);
      }
    }

    hits.sort((a, b) => b.score - a.score);

    // Fallback if not enough results
    if (hits.length < limit) {
      let scanned = 0;
      let fallbackHits = 0;
      for (const file of Object.keys(index.files)) {
        if (ctx.signal?.aborted) break;
        if (scanned >= 300) break;

        // Skip if already in hits
        if (hits.some((h) => h.path === file)) continue;

        const fullPath = path.join(ctx.cwd, file);
        const buffer = await fs.readFile(fullPath).catch(() => null);
        if (!buffer) continue;
        scanned++;

        const lines = buffer.toString("utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          const lowerLine = lines[i]!.toLowerCase();
          if (
            lowerLine.includes(lowerQuery) ||
            (queryTerms.length > 0 && queryTerms.every((t) => lowerLine.includes(t)))
          ) {
            hits.push({
              path: file,
              line: i + 1,
              symbol: "",
              context: lines[i]!.trim().slice(0, 100),
              score: 1,
            });
            fallbackHits++;
            break;
          }
        }
        if (fallbackHits + hits.length >= limit) break;
      }
    }

    hits.sort((a, b) => b.score - a.score);
    const finalHits = hits.slice(0, limit);

    if (finalHits.length === 0) return { output: "No matches found." };

    const output = finalHits
      .map((hit) => {
        const where = hit.line > 0 ? `${hit.path}:${hit.line}` : hit.path;
        const what = hit.symbol ? `  ${hit.symbol}` : "";
        const why = hit.context ? `  — ${hit.context}` : "";
        return `${where}${what}${why}`;
      })
      .join("\n");
    return { output: truncate(output) };
  },
};
