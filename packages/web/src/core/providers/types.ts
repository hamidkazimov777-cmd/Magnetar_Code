export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: "openai-compatible" | "anthropic" | "gemini" | "custom";

  // Дополнительные параметры
  defaultModel?: string;
  additionalHeaders?: Record<string, string>;
  additionalParameters?: Record<string, unknown>;

  // Настройки стриминга и совместимости
  enableStreaming?: boolean;
  compatibilityMode?: boolean; // Например, для отключения специфичных полей
}
