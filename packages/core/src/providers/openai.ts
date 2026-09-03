import { sseLines, ToolCallAccumulator, type ChatChunk } from "./sse.js";
import { parseModelsResponse } from "./models.js";
import { ProviderError, type ChatRequest, type Message, type StreamEvent } from "./types.js";

export interface ProviderTransport {
  baseUrl: string;
  apiKey: string | null;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Sent by OpenRouter-style routers for attribution. */
  referer?: string;
  title?: string;
}

/** A client for any endpoint that speaks OpenAI's /chat/completions. That is
 *  the whole provider layer: one protocol, many hosts. */
export class OpenAICompatibleProvider {
  constructor(private readonly transport: ProviderTransport) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.transport.apiKey) headers.Authorization = `Bearer ${this.transport.apiKey}`;
    if (this.transport.referer) headers["HTTP-Referer"] = this.transport.referer;
    if (this.transport.title) headers["X-Title"] = this.transport.title;
    return headers;
  }

  private get doFetch(): typeof fetch {
    return this.transport.fetch ?? globalThis.fetch;
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await this.doFetch(`${this.transport.baseUrl}/models`, {
      headers: this.headers(),
      signal,
    });
    if (!response.ok) {
      throw new ProviderError(
        `Could not list models (HTTP ${response.status})`,
        response.status,
        await safeText(response),
      );
    }
    return parseModelsResponse(await response.json());
  }

  /** A single non-streaming completion. Used for compaction and titles, where
   *  nobody is watching tokens arrive. */
  async complete(request: ChatRequest): Promise<string> {
    const response = await this.doFetch(`${this.transport.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      signal: request.signal,
      body: JSON.stringify(this.body(request, false)),
    });
    if (!response.ok) throw await providerError(response);
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await this.doFetch(`${this.transport.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      signal: request.signal,
      body: JSON.stringify(this.body(request, true)),
    });
    if (!response.ok) throw await providerError(response);
    if (!response.body) throw new ProviderError("Provider returned an empty stream");

    const tools = new ToolCallAccumulator();
    let finishReason: string | null = null;

    for await (const payload of sseLines(response.body as unknown as AsyncIterable<Uint8Array>)) {
      let chunk: ChatChunk;
      try {
        chunk = JSON.parse(payload) as ChatChunk;
      } catch {
        // Some proxies inject keep-alive comments or partial frames. Skipping a
        // frame we cannot parse is better than killing a live generation.
        continue;
      }

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) yield { type: "delta", text: delta.content };
      const reasoning = delta?.reasoning ?? delta?.reasoning_content;
      if (reasoning) yield { type: "reasoning", text: reasoning };
      if (delta?.tool_calls) tools.add(delta.tool_calls);
      if (choice?.finish_reason) finishReason = choice.finish_reason;

      if (chunk.usage) {
        yield {
          type: "usage",
          usage: {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          },
        };
      }
    }

    if (tools.size > 0) yield { type: "tool_call", calls: tools.result() };
    yield { type: "done", finishReason };
  }

  private body(request: ChatRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(wireMessage),
      stream,
    };
    if (request.tools?.length) body.tools = request.tools;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    // Ask for token counts on the final frame; providers that do not know the
    // option ignore it.
    if (stream) body.stream_options = { include_usage: true };
    return body;
  }
}

/** Our Message carries fields the wire format does not want to see when empty
 *  (a `tool_call_id` on a user turn makes strict endpoints 400). */
function wireMessage(message: Message): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.tool_calls?.length) wire.tool_calls = message.tool_calls;
  if (message.tool_call_id) wire.tool_call_id = message.tool_call_id;
  if (message.name) wire.name = message.name;
  return wire;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

async function providerError(response: Response): Promise<ProviderError> {
  const body = await safeText(response);
  let detail: string;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    detail = typeof parsed.error === "string" ? parsed.error : (parsed.error?.message ?? "");
  } catch {
    detail = body.slice(0, 200);
  }
  const hint =
    response.status === 401
      ? " — check the API key (`magnetar provider`)"
      : response.status === 404
        ? " — check the base URL; it should end in /v1"
        : "";
  return new ProviderError(
    `${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}${hint}`,
    response.status,
    body,
  );
}
