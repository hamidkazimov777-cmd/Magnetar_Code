import fs from "node:fs/promises";
import path from "node:path";
import { magnetarHome, projectMemoryFile } from "../paths.js";

export type MemoryScope = "global" | "project" | "fact";

export interface MemoryFile {
  scope: MemoryScope;
  /** Absolute path, so the UI can tell the user what it is about to edit. */
  file: string;
  /** Display name: "MAGNETAR.md" or a fact's slug. */
  name: string;
  content: string;
}

/** Facts live in the repository under .magnetar/memory, one per file, so they
 *  can be reviewed and committed like anything else. The format matches the
 *  desktop app's, so one memory travels between the two. */
export interface Fact {
  name: string;
  description: string;
  type: "project" | "preference" | "reference";
  body: string;
}

export function factsDir(cwd: string): string {
  return path.join(path.resolve(cwd), ".magnetar", "memory");
}

export function globalMemoryFile(env?: NodeJS.ProcessEnv): string {
  return path.join(magnetarHome(env), "MAGNETAR.md");
}

export async function readMemory(cwd: string, env?: NodeJS.ProcessEnv): Promise<MemoryFile[]> {
  const files: MemoryFile[] = [];

  const global = await read(globalMemoryFile(env));
  if (global !== null) {
    files.push({
      scope: "global",
      file: globalMemoryFile(env),
      name: "MAGNETAR.md (global)",
      content: global,
    });
  }

  const project = await read(projectMemoryFile(cwd));
  if (project !== null) {
    files.push({
      scope: "project",
      file: projectMemoryFile(cwd),
      name: "MAGNETAR.md",
      content: project,
    });
  }

  const dir = factsDir(cwd);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  for (const name of names.sort()) {
    if (!name.endsWith(".md") || name === "MEMORY.md") continue;
    const content = await read(path.join(dir, name));
    if (content !== null) {
      files.push({ scope: "fact", file: path.join(dir, name), name, content });
    }
  }
  return files;
}

/** What goes into the system prompt: the global preferences, then the
 *  project's own file, then the facts. Project instructions win because they
 *  are the more specific ones. */
export async function memoryPrompt(cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const files = await readMemory(cwd, env);
  if (files.length === 0) return "";
  const sections = files.map((file) =>
    file.scope === "fact" ? `## ${file.name}\n${file.content.trim()}` : file.content.trim(),
  );
  return sections.join("\n\n").slice(0, 32_000);
}

export async function writeMemory(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

/** Save one fact, and keep MEMORY.md as an index of them — the same shape the
 *  desktop app uses, so a human can read the directory without tooling. */
export async function saveFact(cwd: string, fact: Fact): Promise<string> {
  const dir = factsDir(cwd);
  const slug =
    fact.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "fact";
  const file = path.join(dir, `${slug}.md`);
  const front = [
    "---",
    `name: ${slug}`,
    `description: ${fact.description.replace(/\n/g, " ")}`,
    "metadata:",
    `  type: ${fact.type}`,
    "---",
    "",
    fact.body.trim(),
    "",
  ].join("\n");
  await writeMemory(file, front);
  await rewriteIndex(cwd);
  return file;
}

export async function deleteFact(cwd: string, name: string): Promise<void> {
  await fs.rm(path.join(factsDir(cwd), name.endsWith(".md") ? name : `${name}.md`), {
    force: true,
  });
  await rewriteIndex(cwd);
}

async function rewriteIndex(cwd: string): Promise<void> {
  const dir = factsDir(cwd);
  const names = (await fs.readdir(dir).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".md") && name !== "MEMORY.md")
    .sort();
  if (names.length === 0) {
    await fs.rm(path.join(dir, "MEMORY.md"), { force: true });
    return;
  }
  const lines: string[] = ["# Project memory", ""];
  for (const name of names) {
    const content = (await read(path.join(dir, name))) ?? "";
    lines.push(`- [${name.replace(/\.md$/, "")}](${name}) — ${describe(content)}`);
  }
  await writeMemory(path.join(dir, "MEMORY.md"), `${lines.join("\n")}\n`);
}

function describe(content: string): string {
  const match = /^description:\s*(.+)$/m.exec(content);
  return match?.[1]?.trim() ?? "";
}

async function read(file: string): Promise<string | null> {
  const content = await fs.readFile(file, "utf8").catch(() => null);
  return content === null || content.trim() === "" ? null : content;
}
