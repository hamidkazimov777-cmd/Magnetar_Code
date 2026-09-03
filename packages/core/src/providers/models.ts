/** Providers disagree about what GET /models returns: OpenAI wraps in `data`,
 *  some proxies return a bare array, Ollama uses `models`, and entries are
 *  sometimes plain strings. The CLI prototype already handled all four; the web
 *  UI assumed `data` and broke on DeepSeek. One parser, one behaviour. */
export function parseModelsResponse(payload: unknown): string[] {
  const list = pickArray(payload);
  const ids = list.map(toId).filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function pickArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "models", "result"]) {
      const value = obj[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function toId(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    for (const key of ["id", "name", "model"]) {
      const value = obj[key];
      if (typeof value === "string") return value;
    }
  }
  return undefined;
}
