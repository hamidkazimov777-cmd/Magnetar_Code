import type { ToolSchema } from "../providers/types.js";

export interface ToolContext {
  /** Project root. Every path a tool touches is resolved inside it. */
  cwd: string;
  signal?: AbortSignal;
  /** Called with a short line describing what is happening, for the spinner. */
  onProgress?: (text: string) => void;
}

export interface ToolResult {
  /** Text handed back to the model. */
  output: string;
  /** True when the tool failed; the model is told, the run continues. */
  isError?: boolean;
  /** Unified diff, when the tool changed a file — the UI renders it. */
  diff?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Tools that can change the machine need approval before they run. */
  mutating: boolean;
  /** One line shown in the approval prompt, e.g. the command or the path. */
  summarize(args: Record<string, unknown>): string;
  run(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export function toSchema(tool: Tool): ToolSchema {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/** Model output is untrusted input: never assume a field is the type declared
 *  in the schema. */
export function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") throw new Error(`Missing required string argument: ${key}`);
  return value;
}

export function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

export function optNum(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
