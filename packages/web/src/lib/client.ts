import type {
  FileEntry,
  SessionMeta,
  SessionResponse,
  StateResponse,
  StreamMessage,
  MemoryFile,
  PermissionMode,
} from "@magnetar/core";

/** In a published install the daemon serves this page and the token comes in
 *  the URL. In development Vite proxies /api and injects the token, so the
 *  page holds nothing. Either way no API key is ever here. */
const token = new URLSearchParams(location.search).get("t") ?? "";

function headers(): HeadersInit {
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...init, headers: headers() });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const api = {
  state: () => request<StateResponse>("state"),
  sessions: () => request<SessionMeta[]>("sessions"),
  newSession: () => request<SessionMeta>("sessions", { method: "POST" }),
  session: (id?: string) => request<SessionResponse>(`session${id ? `?id=${id}` : ""}`),
  files: (path: string) => request<FileEntry[]>(`files?path=${encodeURIComponent(path)}`),
  file: (path: string) =>
    request<{ path: string; content: string }>(`file?path=${encodeURIComponent(path)}`),
  deleteSession: (id: string) =>
    request<{ ok: true }>(`session?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  memory: () => request<MemoryFile[]>("memory"),
  writeMemory: (file: string, content: string) =>
    request<MemoryFile[]>("memory", { method: "POST", body: JSON.stringify({ file, content }) }),
  chat: (text: string) =>
    request<{ ok: true }>("chat", { method: "POST", body: JSON.stringify({ text }) }),
  approve: (id: string, decision: "allow" | "always" | "deny") =>
    request<{ ok: true }>("approve", { method: "POST", body: JSON.stringify({ id, decision }) }),
  cancel: () => request<{ ok: true }>("cancel", { method: "POST" }),
  setProvider: (id: string) =>
    request<{ id: string; name: string; model: string }>("provider", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  setModel: (model: string) =>
    request<{ model: string }>("model", { method: "POST", body: JSON.stringify({ model }) }),
  setPermissionMode: (mode: PermissionMode) =>
    request<{ mode: string }>("permission-mode", {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
};

/** The live stream. EventSource cannot set headers, so the token rides in the
 *  query string; it also reconnects on its own, which is why this is SSE and
 *  not a socket. */
export function openStream(onMessage: (message: StreamMessage) => void): () => void {
  const source = new EventSource(`/api/stream${token ? `?t=${token}` : ""}`);
  source.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data as string) as StreamMessage);
    } catch {
      // Keep-alive frames and anything malformed are not worth a crash.
    }
  };
  return () => source.close();
}
