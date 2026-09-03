export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: Record<string, unknown>[];
}

export interface Model {
  id: string;
  name: string;
  providerId: string;
  contextWindow?: number;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  type: 'openai-compatible' | 'anthropic' | 'gemini' | 'custom';
  
  /**
   * Initializes or verifies the provider connection.
   */
  initialize(): Promise<boolean>;

  /**
   * Fetches the list of available models for this provider.
   */
  fetchModels(): Promise<Model[]>;

  /**
   * Sends a chat request and returns the full response.
   */
  chat(request: ChatRequest): Promise<string>;

  /**
   * Sends a chat request and streams the response.
   */
  streamChat(request: ChatRequest): AsyncGenerator<string, void, unknown>;
}
