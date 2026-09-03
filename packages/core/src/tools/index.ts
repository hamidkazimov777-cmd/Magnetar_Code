import { editFile, listDir, readFile, writeFile } from "./fs.js";
import { glob, grep } from "./search.js";
import { runCommandTool } from "./shell.js";
import { TodoStore, todoWriteTool, type TodoItem } from "./todo.js";
import type { Tool } from "./types.js";

export interface ToolsetOptions {
  todos?: TodoStore;
  onTodoChange?: (items: readonly TodoItem[]) => void;
}

/** The default toolset, in the order the model sees it. Read-only tools come
 *  first so a model skimming the list reaches for those before the shell. */
export function defaultTools(options: ToolsetOptions = {}): Tool[] {
  const store = options.todos ?? new TodoStore();
  return [
    readFile,
    listDir,
    glob,
    grep,
    editFile,
    writeFile,
    runCommandTool,
    todoWriteTool(store, options.onTodoChange),
  ];
}

export { readFile, writeFile, editFile, listDir, glob, grep, runCommandTool };
export { TodoStore, todoWriteTool, type TodoItem, type TodoStatus } from "./todo.js";
export { resolveInRoot, SandboxError, isIgnoredDir } from "./sandbox.js";
export { unifiedDiff, truncate } from "./text.js";
export { globToRegExp, matchesGlob } from "./glob.js";
export { toSchema, type Tool, type ToolContext, type ToolResult } from "./types.js";
