import { describe, it, expect } from "vitest";
import { parseModelsResponse } from "./models.js";
import { sseLines, ToolCallAccumulator } from "./sse.js";
import { normalizeBaseUrl } from "../config/presets.js";
import { OpenAICompatibleProvider } from "./openai.js";
import { ProviderError } from "./types.js";

describe("parseModelsResponse", () => {
  it("reads the OpenAI shape", () => {
    expect(parseModelsResponse({ data: [{ id: "gpt-4o" }, { id: "gpt-5" }] })).toEqual([
      "gpt-4o",
      "gpt-5",
    ]);
  });

  it("reads a bare array, an Ollama list and plain strings", () => {
    expect(parseModelsResponse(["b", "a"])).toEqual(["a", "b"]);
    expect(parseModelsResponse({ models: [{ name: "llama3" }] })).toEqual(["llama3"]);
    expect(parseModelsResponse({ data: [{ model: "kimi-k2" }] })).toEqual(["kimi-k2"]);
  });

  it("dedupes and survives junk", () => {
    expect(parseModelsResponse({ data: [{ id: "a" }, "a", null, 7, {}] })).toEqual(["a"]);
    expect(parseModelsResponse(null)).toEqual([]);
    expect(parseModelsResponse({ error: "nope" })).toEqual([]);
  });
});

describe("normalizeBaseUrl", () => {
  it("adds a scheme and trims noise", () => {
    expect(normalizeBaseUrl(" api.openai.com/v1/ ")).toBe("https://api.openai.com/v1");
    expect(normalizeBaseUrl("http://localhost:1234/v1")).toBe("http://localhost:1234/v1");
    expect(normalizeBaseUrl("https://x.dev/v1/chat/completions")).toBe("https://x.dev/v1");
  });
});

async function* bytes(...chunks: string[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  for (const chunk of chunks) yield encoder.encode(chunk);
}

describe("sseLines", () => {
  it("handles chunk boundaries, CRLF and [DONE]", async () => {
    const out: string[] = [];
    for await (const payload of sseLines(
      bytes('data: {"a"', ":1}\r\n", "data: [DONE]\n", "data: x\n"),
    ))
      out.push(payload);
    expect(out).toEqual(['{"a":1}']);
  });

  it("survives a multibyte character split across chunks", async () => {
    const encoder = new TextEncoder();
    const full = encoder.encode('data: {"t":"привет"}\n');
    const cut = 14;
    async function* split(): AsyncGenerator<Uint8Array> {
      yield full.subarray(0, cut);
      yield full.subarray(cut);
    }
    const out: string[] = [];
    for await (const payload of sseLines(split())) out.push(payload);
    expect(JSON.parse(out[0]!)).toEqual({ t: "привет" });
  });
});

describe("ToolCallAccumulator", () => {
  it("joins fragments by index and keeps order", () => {
    const acc = new ToolCallAccumulator();
    acc.add([{ index: 1, id: "b", function: { name: "grep", arguments: '{"p' } }]);
    acc.add([{ index: 0, id: "a", function: { name: "read_", arguments: "{}" } }]);
    acc.add([{ index: 0, function: { name: "file" } }]);
    acc.add([{ index: 1, function: { arguments: '":1}' } }]);
    expect(acc.result()).toEqual([
      { id: "a", type: "function", function: { name: "read_file", arguments: "{}" } },
      { id: "b", type: "function", function: { name: "grep", arguments: '{"p":1}' } },
    ]);
  });

  it("synthesises an id when the provider omits one", () => {
    const acc = new ToolCallAccumulator();
    acc.add([{ index: 0, function: { name: "x", arguments: "{}" } }]);
    expect(acc.result()[0]!.id).toBe("call_0");
  });
});

function streamResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("OpenAICompatibleProvider", () => {
  it("streams text, tool calls and usage in order", async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: {"choices":[{"delta":{"reasoning":"hmm"}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"glob","arguments":"{}"}}]}},{"finish_reason":"tool_calls"}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":4}}',
      "data: [DONE]",
      "",
    ].join("\n");

    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://x/v1",
      apiKey: "k",
      fetch: async () => streamResponse(frames),
    });

    const events = [];
    for await (const event of provider.stream({ model: "m", messages: [] })) events.push(event);

    expect(events.map((e) => e.type)).toEqual([
      "delta",
      "delta",
      "reasoning",
      "usage",
      "tool_call",
      "done",
    ]);
    expect(
      events
        .filter((e) => e.type === "delta")
        .map((e) => e.text)
        .join(""),
    ).toBe("Hello");
  });

  it("skips a frame it cannot parse rather than killing the stream", async () => {
    const frames = 'data: not json\ndata: {"choices":[{"delta":{"content":"ok"}}]}\ndata: [DONE]\n';
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://x/v1",
      apiKey: "k",
      fetch: async () => streamResponse(frames),
    });
    const text: string[] = [];
    for await (const event of provider.stream({ model: "m", messages: [] })) {
      if (event.type === "delta") text.push(event.text);
    }
    expect(text.join("")).toBe("ok");
  });

  it("explains a 401 instead of surfacing a bare status", async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://x/v1",
      apiKey: "bad",
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: "Invalid key" } }), {
          status: 401,
          statusText: "Unauthorized",
        }),
    });
    await expect(
      (async () => {
        for await (const _ of provider.stream({ model: "m", messages: [] })) void _;
      })(),
    ).rejects.toThrow(/Invalid key.*API key/s);
  });

  it("omits empty tool fields from the wire message", async () => {
    let sent: Record<string, unknown> = {};
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://x/v1",
      apiKey: null,
      fetch: async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
          status: 200,
        });
      },
    });
    await provider.complete({ model: "m", messages: [{ role: "user", content: "yo" }] });
    expect((sent.messages as unknown[])[0]).toEqual({ role: "user", content: "yo" });
  });

  it("sends no Authorization header for a keyless endpoint", async () => {
    let headers: Record<string, string> = {};
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:11434/v1",
      apiKey: null,
      fetch: async (_url, init) => {
        headers = (init as RequestInit).headers as Record<string, string>;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
    });
    await provider.listModels();
    expect(headers.Authorization).toBeUndefined();
  });

  it("reports a bad base URL as a hint about /v1", async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://x",
      apiKey: "k",
      fetch: async () => new Response("nope", { status: 404, statusText: "Not Found" }),
    });
    await expect(provider.listModels()).rejects.toBeInstanceOf(ProviderError);
  });
});
