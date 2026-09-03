import type { AgentEvent, StopReason } from "../agent/loop.js";
import type { SessionMeta } from "../session/session.js";
import type { Message } from "../providers/types.js";
import type { PermissionMode } from "../config/types.js";
import type { TodoItem } from "../tools/todo.js";

/** What the monitor learns about the running agent when it connects. */
export interface StateResponse {
  version: string;
  cwd: string;
  provider: { id: string; name: string; baseUrl: string };
  model: string;
  models: string[];
  permissionMode: PermissionMode;
  session: SessionMeta;
  sessions: SessionMeta[];
  todos: readonly TodoItem[];
  busy: boolean;
}

export interface SessionResponse {
  meta: SessionMeta;
  messages: Message[];
}

export interface FileEntry {
  name: string;
  path: string;
  directory: boolean;
  /** True when the agent has written to it during this session. */
  changed?: boolean;
}

/** Everything the chat stream can send. The agent's own events pass through
 *  unchanged; the extra ones exist because a browser, unlike a terminal, is
 *  not already sitting inside the run. */
export type StreamMessage =
  | AgentEvent
  | { type: "approval_request"; id: string; tool: string; summary: string; mutating: boolean }
  | { type: "approval_resolved"; id: string; decision: "allow" | "always" | "deny" }
  | { type: "finished"; stopReason: StopReason; steps: number; costUsd: number; error?: string };

export interface ChatRequestBody {
  text: string;
}

export interface ApproveRequestBody {
  id: string;
  decision: "allow" | "always" | "deny";
}
