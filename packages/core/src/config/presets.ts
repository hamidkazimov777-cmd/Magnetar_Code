/** Preset endpoints for "add a provider". Kept identical to the desktop app's
 *  OPENAI_COMPAT_PRESETS so a user who set Magnetar up there recognises the
 *  list here. Picking one leaves only the API key to type. */
export interface Preset {
  readonly name: string;
  readonly baseUrl: string;
  /** Local endpoints accept any key (or none); we skip the key prompt. */
  readonly keyless?: boolean;
}

export const PRESETS: readonly Preset[] = [
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "TokenRouter", baseUrl: "https://api.tokenrouter.com/v1" },
  { name: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.ai/v1" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { name: "Together", baseUrl: "https://api.together.xyz/v1" },
  { name: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", keyless: true },
  { name: "Ollama (local)", baseUrl: "http://localhost:11434/v1", keyless: true },
];

/** Normalise whatever the user pasted into a usable base URL: add a scheme,
 *  drop a trailing slash, and forgive a trailing /chat/completions. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/chat\/completions$/i, "");
  return url;
}
