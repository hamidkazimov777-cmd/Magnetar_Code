import type { ToolCall } from "./types.js";

/** One `data:` payload from a chat-completions stream, already JSON-parsed. */
export interface ChatChunk {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/** Split an SSE byte stream into `data:` payloads. Handles chunk boundaries
 *  landing mid-line and mid-multibyte-character, and both \n and \r\n. */
export async function* sseLines(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      yield payload;
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith("data:")) {
    const payload = rest.slice(5).trim();
    if (payload && payload !== "[DONE]") yield payload;
  }
}

/** Tool calls stream in as fragments addressed by index; assemble them. */
export class ToolCallAccumulator {
  private readonly parts = new Map<number, ToolCall>();

  add(deltas: NonNullable<NonNullable<ChatChunk["choices"]>[number]["delta"]>["tool_calls"]): void {
    for (const delta of deltas ?? []) {
      let call = this.parts.get(delta.index);
      if (!call) {
        call = { id: "", type: "function", function: { name: "", arguments: "" } };
        this.parts.set(delta.index, call);
      }
      if (delta.id) call.id = delta.id;
      if (delta.function?.name) call.function.name += delta.function.name;
      if (delta.function?.arguments) call.function.arguments += delta.function.arguments;
    }
  }

  /** Ordered by index, with an id synthesised if the provider omitted one. */
  result(): ToolCall[] {
    return [...this.parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]) => ({
        ...call,
        id: call.id || `call_${index}`,
      }));
  }

  get size(): number {
    return this.parts.size;
  }
}
