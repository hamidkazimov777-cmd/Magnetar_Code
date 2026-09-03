import path from "node:path";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

/** Resolve a tool-supplied path against the project root and refuse anything
 *  that lands outside it. The prototype passed paths straight to fs, so a model
 *  that asked for ../../.ssh/id_rsa got it. */
export function resolveInRoot(root: string, candidate: string): string {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, candidate);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative === "") return resolved;
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SandboxError(
      `Path is outside the project directory: ${candidate}. Only paths under ${absoluteRoot} are allowed.`,
    );
  }
  return resolved;
}

/** Directories no agent needs to read and every agent wants to walk into. */
const IGNORED = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  "coverage",
]);

export function isIgnoredDir(name: string): boolean {
  return IGNORED.has(name);
}
