import { describe, it, expect } from "vitest";
import path from "node:path";
import { magnetarHome, configFile, projectSessionsDir, projectMemoryFile } from "./paths.js";

const env = { MAGNETAR_HOME: "/tmp/mag-home" } as unknown as NodeJS.ProcessEnv;

describe("paths", () => {
  it("honours MAGNETAR_HOME", () => {
    expect(magnetarHome(env)).toBe("/tmp/mag-home");
    expect(configFile(env)).toBe(path.join("/tmp/mag-home", "config.json"));
  });

  it("falls back to the home directory", () => {
    expect(magnetarHome({} as NodeJS.ProcessEnv)).toMatch(/\.magnetar$/);
  });

  it("gives different projects different session directories", () => {
    const a = projectSessionsDir("/a/project", env);
    const b = projectSessionsDir("/b/project", env);
    expect(a).not.toBe(b);
    expect(path.basename(a)).toMatch(/^project-[0-9a-f]{12}$/);
  });

  it("is stable for the same path", () => {
    expect(projectSessionsDir("/a/project", env)).toBe(projectSessionsDir("/a/project/", env));
  });

  it("puts project memory in the repository", () => {
    expect(projectMemoryFile("/a/project")).toBe("/a/project/MAGNETAR.md");
  });
});
