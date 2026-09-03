import fs from "node:fs/promises";
import path from "node:path";
import { resolveInRoot, isIgnoredDir } from "./sandbox.js";
import { MAX_FILE_BYTES, looksBinary, numberLines, truncate, unifiedDiff } from "./text.js";
import { optNum, str, type Tool } from "./types.js";

export const readFile: Tool = {
  name: "read_file",
  description:
    "Read a text file from the project. Returns numbered lines. Use offset/limit for large files.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path relative to the project root" },
      offset: { type: "number", description: "First line to read (1-based)" },
      limit: { type: "number", description: "How many lines to read (default 2000)" },
    },
    required: ["file_path"],
  },
  summarize: (args) => String(args.file_path ?? ""),
  async run(args, ctx) {
    const target = resolveInRoot(ctx.cwd, str(args, "file_path"));
    const stat = await fs.stat(target).catch(() => null);
    if (!stat) return { output: `File not found: ${args.file_path}`, isError: true };
    if (stat.isDirectory()) {
      return { output: `${args.file_path} is a directory — use list_dir.`, isError: true };
    }
    if (stat.size > MAX_FILE_BYTES) {
      return {
        output: `File is ${Math.round(stat.size / 1024)} KB, over the ${MAX_FILE_BYTES / 1024} KB limit. Read a range with offset/limit, or grep for what you need.`,
        isError: true,
      };
    }
    const buffer = await fs.readFile(target);
    if (looksBinary(buffer)) {
      return { output: `${args.file_path} looks like a binary file.`, isError: true };
    }
    const all = buffer.toString("utf8").split("\n");
    const offset = Math.max(1, optNum(args, "offset") ?? 1);
    const limit = Math.max(1, optNum(args, "limit") ?? 2000);
    const slice = all.slice(offset - 1, offset - 1 + limit);
    const header =
      slice.length < all.length
        ? `[lines ${offset}-${offset + slice.length - 1} of ${all.length}]\n`
        : "";
    return { output: truncate(header + numberLines(slice.join("\n"), offset)) };
  },
};

export const writeFile: Tool = {
  name: "write_file",
  description:
    "Create a file, or replace one entirely. Prefer edit_file when changing part of an existing file.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      content: { type: "string", description: "The complete new contents" },
    },
    required: ["file_path", "content"],
  },
  summarize: (args) => String(args.file_path ?? ""),
  async run(args, ctx) {
    const relative = str(args, "file_path");
    const target = resolveInRoot(ctx.cwd, relative);
    const content = str(args, "content");
    const before = await fs.readFile(target, "utf8").catch(() => null);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write-then-rename: a crash mid-write leaves the original intact.
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, target);
    return {
      output: before === null ? `Created ${relative}` : `Overwrote ${relative}`,
      diff: unifiedDiff(relative, before ?? "", content),
    };
  },
};

export const editFile: Tool = {
  name: "edit_file",
  description:
    "Replace an exact block of text in a file. old_text must appear exactly once — include surrounding lines to make it unique.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      old_text: { type: "string", description: "Exact text to replace, including indentation" },
      new_text: { type: "string" },
    },
    required: ["file_path", "old_text", "new_text"],
  },
  summarize: (args) => String(args.file_path ?? ""),
  async run(args, ctx) {
    const relative = str(args, "file_path");
    const target = resolveInRoot(ctx.cwd, relative);
    const oldText = str(args, "old_text");
    const newText = str(args, "new_text");
    const before = await fs.readFile(target, "utf8").catch(() => null);
    if (before === null) return { output: `File not found: ${relative}`, isError: true };

    const occurrences = before.split(oldText).length - 1;
    if (occurrences === 0) {
      return {
        output: `old_text was not found in ${relative}. Whitespace and indentation must match exactly — read the file again before retrying.`,
        isError: true,
      };
    }
    // The prototype replaced the first match silently, which quietly edited the
    // wrong function whenever the snippet was not unique.
    if (occurrences > 1) {
      return {
        output: `old_text appears ${occurrences} times in ${relative}. Include more surrounding context so it matches exactly one place.`,
        isError: true,
      };
    }
    const after = before.replace(oldText, newText);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, after, "utf8");
    await fs.rename(tmp, target);
    return { output: `Edited ${relative}`, diff: unifiedDiff(relative, before, after) };
  },
};

export const listDir: Tool = {
  name: "list_dir",
  description:
    "List files and directories at a path. Skips node_modules, .git and other build output.",
  mutating: false,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Defaults to the project root" } },
  },
  summarize: (args) => String(args.path ?? "."),
  async run(args, ctx) {
    const relative = typeof args.path === "string" ? args.path : ".";
    const target = resolveInRoot(ctx.cwd, relative);
    const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => null);
    if (!entries) return { output: `Not a directory: ${relative}`, isError: true };
    const lines = entries
      .filter((entry) => !(entry.isDirectory() && isIgnoredDir(entry.name)))
      .filter((entry) => !entry.name.startsWith("."))
      .sort(
        (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
      )
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
    return { output: lines.length ? truncate(lines.join("\n")) : "(empty)" };
  },
};
