import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveInRoot, SandboxError } from "./sandbox.js";
import { globToRegExp } from "./glob.js";
import { unifiedDiff, truncate, looksBinary } from "./text.js";
import { readFile, writeFile, editFile, listDir } from "./fs.js";
import { glob, grep } from "./search.js";
import { runCommand } from "./shell.js";
import type { ToolContext } from "./types.js";

let root: string;
let ctx: ToolContext;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-test-"));
  ctx = { cwd: root };
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("sandbox", () => {
  it("allows paths inside the root", () => {
    expect(resolveInRoot("/project", "src/a.ts")).toBe("/project/src/a.ts");
    expect(resolveInRoot("/project", "./")).toBe("/project");
  });

  it("refuses to escape the root", () => {
    expect(() => resolveInRoot("/project", "../secrets")).toThrow(SandboxError);
    expect(() => resolveInRoot("/project", "/etc/passwd")).toThrow(SandboxError);
    expect(() => resolveInRoot("/project", "src/../../etc/hosts")).toThrow(SandboxError);
  });

  it("does not treat a sibling with a shared prefix as inside", () => {
    expect(() => resolveInRoot("/project", "../project-evil/x")).toThrow(SandboxError);
  });
});

describe("globToRegExp", () => {
  it("matches the syntax an agent actually writes", () => {
    expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/c.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("a.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("src/a.ts")).toBe(false);
    expect(globToRegExp("*.{ts,tsx}").test("a.tsx")).toBe(true);
    expect(globToRegExp("a?.js").test("a1.js")).toBe(true);
    expect(globToRegExp("a.b").test("axb")).toBe(false);
  });
});

describe("unifiedDiff", () => {
  it("shows only the changed window", () => {
    const diff = unifiedDiff("a.txt", "1\n2\n3\n", "1\nX\n3\n");
    expect(diff).toContain("-2");
    expect(diff).toContain("+X");
    expect(diff.split("\n").filter((l) => l.startsWith("+")).length).toBe(2); // +++ header and the change
  });

  it("is empty when nothing changed", () => {
    expect(unifiedDiff("a.txt", "same", "same")).toBe("");
  });
});

describe("text helpers", () => {
  it("truncates with a note", () => {
    expect(truncate("abcdef", 3)).toMatch(/^abc\n\n\[\.\.\. truncated 3/);
  });
  it("spots binary content", () => {
    expect(looksBinary(Buffer.from([0x41, 0x00, 0x42]))).toBe(true);
    expect(looksBinary(Buffer.from("plain text"))).toBe(false);
  });
});

describe("read_file", () => {
  it("numbers lines and reports a range", async () => {
    await fs.writeFile(path.join(root, "a.txt"), "one\ntwo\nthree\n");
    const all = await readFile.run({ file_path: "a.txt" }, ctx);
    expect(all.output).toContain("    1\tone");
    const part = await readFile.run({ file_path: "a.txt", offset: 2, limit: 1 }, ctx);
    expect(part.output).toContain("[lines 2-2 of 4]");
    expect(part.output).toContain("    2\ttwo");
  });

  it("refuses a directory, a missing file and a binary", async () => {
    await fs.mkdir(path.join(root, "dir"));
    await fs.writeFile(path.join(root, "bin"), Buffer.from([0, 1, 2]));
    expect((await readFile.run({ file_path: "dir" }, ctx)).isError).toBe(true);
    expect((await readFile.run({ file_path: "nope" }, ctx)).isError).toBe(true);
    expect((await readFile.run({ file_path: "bin" }, ctx)).isError).toBe(true);
  });

  it("refuses a file over the size limit and says what to do instead", async () => {
    await fs.writeFile(path.join(root, "big.txt"), "x".repeat(300 * 1024));
    const result = await readFile.run({ file_path: "big.txt" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/grep/);
  });
});

describe("write_file", () => {
  it("creates directories and reports a diff", async () => {
    const result = await writeFile.run({ file_path: "src/new.ts", content: "hi\n" }, ctx);
    expect(result.output).toContain("Created");
    expect(await fs.readFile(path.join(root, "src/new.ts"), "utf8")).toBe("hi\n");
    expect(result.diff).toContain("+hi");
  });

  it("leaves no temporary file behind", async () => {
    await writeFile.run({ file_path: "a.txt", content: "x" }, ctx);
    expect(await fs.readdir(root)).toEqual(["a.txt"]);
  });
});

describe("edit_file", () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(root, "a.ts"), "const a = 1;\nconst b = 1;\n");
  });

  it("replaces a unique block", async () => {
    const result = await editFile.run(
      { file_path: "a.ts", old_text: "const a = 1;", new_text: "const a = 2;" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(await fs.readFile(path.join(root, "a.ts"), "utf8")).toBe("const a = 2;\nconst b = 1;\n");
  });

  it("refuses an ambiguous match instead of editing the wrong one", async () => {
    const result = await editFile.run(
      { file_path: "a.ts", old_text: " = 1;", new_text: " = 2;" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain("appears 2 times");
    expect(await fs.readFile(path.join(root, "a.ts"), "utf8")).toContain("const a = 1;");
  });

  it("explains a miss in terms of whitespace", async () => {
    const result = await editFile.run({ file_path: "a.ts", old_text: "nope", new_text: "x" }, ctx);
    expect(result.output).toMatch(/whitespace/i);
  });
});

describe("list_dir, glob and grep", () => {
  beforeEach(async () => {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(root, "node_modules", "junk.ts"), "needle\n");
    await fs.writeFile(path.join(root, "src", "a.ts"), "const needle = 1;\n");
    await fs.writeFile(path.join(root, "src", "b.js"), "nothing here\n");
  });

  it("hides build directories", async () => {
    const result = await listDir.run({}, ctx);
    expect(result.output).toContain("src/");
    expect(result.output).not.toContain("node_modules");
  });

  it("globs by extension without walking node_modules", async () => {
    const result = await glob.run({ pattern: "**/*.ts" }, ctx);
    expect(result.output).toBe("src/a.ts");
  });

  it("greps with file and line numbers", async () => {
    const result = await grep.run({ pattern: "needle", include: "*.ts" }, ctx);
    expect(result.output).toBe("src/a.ts:1: const needle = 1;");
  });

  it("reports a bad regex instead of throwing", async () => {
    const result = await grep.run({ pattern: "(" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("run_command", () => {
  it("captures output and exit codes", async () => {
    const ok = await runCommand("echo hello", ctx);
    expect(ok.output).toContain("hello");
    expect(ok.isError).toBe(false);
    const bad = await runCommand("exit 3", ctx);
    expect(bad.isError).toBe(true);
    expect(bad.output).toContain("code 3");
  });

  it("runs in the project directory", async () => {
    const result = await runCommand("pwd", ctx);
    expect(await fs.realpath(result.output.trim())).toBe(await fs.realpath(root));
  });

  it("kills a command that outlives its timeout", async () => {
    const result = await runCommand("sleep 5", ctx, 200);
    expect(result.isError).toBe(true);
    expect(result.output).toContain("timed out");
  });

  it("kills a command when the run is cancelled", async () => {
    const controller = new AbortController();
    const promise = runCommand("sleep 5", { cwd: root, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    const result = await promise;
    expect(result.output).toContain("cancelled");
  });
});
