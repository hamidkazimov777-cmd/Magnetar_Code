import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildIndex } from "./index-repo.js";
import { find_code } from "./search.js";

describe("index-repo and find_code", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "magnetar-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function write(relPath: string, content: string | Buffer) {
    const full = path.join(tmpDir, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  async function runFind(query: string, limit?: number) {
    return find_code.run({ query, ...(limit !== undefined ? { limit } : {}) }, { cwd: tmpDir });
  }

  it("skips binary and giant files", async () => {
    await write("text.ts", "export const a = 1;");
    const bin = Buffer.from([0, 1, 2, 3]);
    await write("bin.dat", bin);
    const giant = Buffer.alloc(300 * 1024, "a");
    await write("giant.txt", giant);

    const index = await buildIndex(tmpDir);
    expect(Object.keys(index.files)).toEqual(["text.ts"]);
  });

  it("ignores node_modules, .git, and dist", async () => {
    await write("src/ok.ts", "export const a = 1;");
    await write("node_modules/bad.ts", "export const a = 1;");
    await write(".git/config", "export const a = 1;");
    await write("dist/out.js", "export const a = 1;");

    const index = await buildIndex(tmpDir);
    expect(Object.keys(index.files)).toEqual(["src/ok.ts"]);
  });

  it("creates and re-reads .magnetar/index.json", async () => {
    await write("a.ts", "export const a = 1;");
    const index1 = await buildIndex(tmpDir);
    expect(Object.keys(index1.files)).toEqual(["a.ts"]);

    const stat = await fs.stat(path.join(tmpDir, ".magnetar/index.json"));
    expect(stat.isFile()).toBe(true);

    const index2 = await buildIndex(tmpDir);
    expect(Object.keys(index2.files)).toEqual(["a.ts"]);
  });

  it("re-indexes modified files and skips unmodified", async () => {
    await write("a.ts", "export const a = 1;");
    await write("b.ts", "export const b = 2;");

    const index1 = await buildIndex(tmpDir);
    const mtimeA = index1.files["a.ts"]!.mtime;

    // wait a bit so mtime changes
    await new Promise((r) => setTimeout(r, 10));
    await write("b.ts", "export const b = 3;");

    const index2 = await buildIndex(tmpDir);
    expect(index2.files["a.ts"]!.mtime).toBe(mtimeA); // Unmodified
    expect(index2.files["b.ts"]!.mtime).not.toBe(index1.files["b.ts"]!.mtime); // Modified
  });

  it("handles non-existent directory gracefully", async () => {
    const fakeDir = path.join(tmpDir, "nope");
    const index = await buildIndex(fakeDir);
    expect(Object.keys(index.files).length).toBe(0);
  });

  it("find_code returns empty message for empty query", async () => {
    const res = await runFind("");
    expect(res.output).toBe("Empty query.");
  });

  it("find_code returns no matches for missing query", async () => {
    await write("a.ts", "export const a = 1;");
    const res = await runFind("nope");
    expect(res.output).toBe("No matches found.");
  });

  it("ranks exact symbol match higher than body match", async () => {
    await write("exact.ts", "export const testTarget = 1;");
    await write("body.ts", "const a = 1;\n// we use testTarget here");

    const res = await runFind("testTarget");
    const lines = res.output.split("\n");
    expect(lines[0]).toContain("exact.ts");
    expect(lines[1]).toContain("body.ts");
  });

  it("ranks exact symbol match higher than partial symbol match", async () => {
    await write("partial.ts", "export const testTargetPartial = 1;");
    await write("exact.ts", "export const testTarget = 1;");

    const res = await runFind("testTarget");
    const lines = res.output.split("\n");
    expect(lines[0]).toContain("exact.ts");
    expect(lines[1]).toContain("partial.ts");
  });

  it("ranks path match above header match", async () => {
    await write("src/folder/file.ts", "const a = 1;");
    await write("other.ts", "// this is folder module\nconst b = 1;");

    const res = await runFind("folder");
    const lines = res.output.split("\n");
    expect(lines[0]).toContain("src/folder/file.ts");
    expect(lines[1]).toContain("other.ts");
  });

  it("aborts index build if signal is triggered", async () => {
    await write("a.ts", "export const a = 1;");
    const ctrl = new AbortController();
    ctrl.abort();
    const index = await buildIndex(tmpDir, ctrl.signal);
    // Since it's aborted before queue process, it should be empty
    expect(Object.keys(index.files).length).toBe(0);
  });

  it("aborts find_code if signal is triggered", async () => {
    await write("a.ts", "export const a = 1;");
    const ctrl = new AbortController();
    ctrl.abort();
    const res = await find_code.run({ query: "a" }, { cwd: tmpDir, signal: ctrl.signal });
    expect(res.output).toBe("Aborted.");
  });
});
