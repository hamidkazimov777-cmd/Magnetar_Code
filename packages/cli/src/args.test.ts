import { describe, it, expect } from "vitest";
import { parseArgs } from "./args.js";
import { filterCommands, resolveCommand, COMMANDS } from "./commands.js";

describe("parseArgs", () => {
  it("defaults to an interactive run", () => {
    const args = parseArgs([]);
    expect(args.command).toBeUndefined();
    expect(args.print).toBeUndefined();
    expect(args.outputFormat).toBe("text");
    expect(args.errors).toEqual([]);
  });

  it("treats a bare argument as the first message", () => {
    expect(parseArgs(["fix", "the", "build"]).initialMessage).toBe("fix the build");
  });

  it("reads sub-commands", () => {
    expect(parseArgs(["provider"]).command).toBe("provider");
    expect(parseArgs(["doctor"]).command).toBe("doctor");
  });

  it("takes long and short forms of every flag", () => {
    const args = parseArgs([
      "-p",
      "hello",
      "-m",
      "gpt-5",
      "-C",
      "/tmp",
      "-c",
      "--output-format",
      "json",
      "--max-steps",
      "5",
    ]);
    expect(args).toMatchObject({
      print: "hello",
      model: "gpt-5",
      cwd: "/tmp",
      continue: true,
      outputFormat: "json",
      maxSteps: 5,
    });
  });

  it("maps the dangerous flag onto yolo", () => {
    expect(parseArgs(["--dangerously-skip-permissions"]).permissionMode).toBe("yolo");
    expect(parseArgs(["--permission-mode", "auto-edit"]).permissionMode).toBe("auto-edit");
  });

  it("collects errors instead of throwing", () => {
    expect(parseArgs(["--nope"]).errors).toEqual(["unknown option: --nope"]);
    expect(parseArgs(["--permission-mode", "god"]).errors).toEqual([
      "unknown permission mode: god",
    ]);
    expect(parseArgs(["--max-steps", "zero"]).errors).toHaveLength(1);
    expect(parseArgs(["-m"]).errors).toEqual(["-m needs a value"]);
  });

  it("keeps -p empty-string distinct from absent", () => {
    expect(parseArgs(["-p", ""]).print).toBe("");
    expect(parseArgs([]).print).toBeUndefined();
  });
});

describe("slash commands", () => {
  it("resolves names and aliases with their argument", () => {
    expect(resolveCommand("/add src/a.ts")).toMatchObject({
      command: { name: "/add" },
      argument: "src/a.ts",
    });
    expect(resolveCommand("/read x")?.command.name).toBe("/add");
    expect(resolveCommand("/quit")?.command.name).toBe("/exit");
    expect(resolveCommand("/nope")).toBeNull();
  });

  it("ranks prefix matches above description matches", () => {
    const results = filterCommands("/co");
    expect(results[0]!.name).toBe("/cost");
    expect(results.map((c) => c.name)).toContain("/context");
  });

  it("finds a command by what it does", () => {
    expect(filterCommands("/key").map((c) => c.name)).toContain("/provider");
  });

  it("lists everything for a bare slash", () => {
    expect(filterCommands("/")).toHaveLength(COMMANDS.length);
    expect(filterCommands("hello")).toEqual([]);
  });
});
