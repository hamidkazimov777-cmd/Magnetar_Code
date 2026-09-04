import { describe, it, expect } from "vitest";
import { COMMANDS, PROMPTS, filterCommands, promptFor, resolveCommand } from "./registry.js";

describe("command registry", () => {
  it("offers at least fifty commands", () => {
    expect(COMMANDS.length).toBeGreaterThanOrEqual(50);
  });

  it("registers no name or alias twice", () => {
    const seen = new Set<string>();
    for (const command of COMMANDS) {
      for (const name of [command.name, ...(command.aliases ?? [])]) {
        expect(seen.has(name), `${name} is registered twice`).toBe(false);
        seen.add(name);
      }
    }
  });

  it("gives every prompt macro an actual prompt", () => {
    // A macro without a prompt is a command that silently does nothing.
    for (const command of COMMANDS.filter((c) => c.kind === "prompt")) {
      const prompt = promptFor(command.name);
      expect(prompt, `${command.name} has no prompt`).toBeTruthy();
      expect(prompt!.length).toBeGreaterThan(120);
    }
    for (const name of Object.keys(PROMPTS)) {
      expect(
        COMMANDS.some((c) => c.name === name),
        `${name} is not registered`,
      ).toBe(true);
    }
  });

  it("resolves names, aliases and arguments", () => {
    expect(resolveCommand("/btw deploys from main")).toMatchObject({
      command: { name: "/btw" },
      argument: "deploys from main",
    });
    expect(resolveCommand("/login")?.command.name).toBe("/provider");
    expect(resolveCommand("/nope")).toBeNull();
  });

  it("ranks the shortest prefix match first", () => {
    expect(filterCommands("/co")[0]!.name).toBe("/cost");
    expect(filterCommands("/key").map((c) => c.name)).toContain("/provider");
    expect(filterCommands("/")).toHaveLength(COMMANDS.length);
  });
});
