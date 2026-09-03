export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Message {
  role: Role;
  content: string | null;
  /** Assistant turns that called tools. */
  tool_calls?: ToolCall[];
  /** Tool results answer a specific call. */
  tool_call_id?: string;
  name?: string;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** Everything the transport can emit, in the order it arrives. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; calls: ToolCall[] }
  | { type: "usage"; usage: Usage }
  | { type: "done"; finishReason: string | null };

export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
