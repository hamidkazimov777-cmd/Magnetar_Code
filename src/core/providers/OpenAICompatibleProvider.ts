import { AIProvider, ChatRequest, Model } from './AIProvider';

export class OpenAICompatibleProvider implements AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: 'openai-compatible' | 'custom';

  constructor(id: string, name: string, baseUrl: string, apiKey: string, type: 'openai-compatible' | 'custom' = 'openai-compatible') {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.type = type;
  }

  async initialize(): Promise<boolean> {
    try {
      const models = await this.fetchModels();
      return models.length > 0;
    } catch (error) {
      console.error(`Failed to initialize provider ${this.name}:`, error);
      return false;
    }
  }

  async fetchModels(): Promise<Model[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.map((m: any) => ({
      id: m.id,
      name: m.id,
      providerId: this.id,
    }));
  }

  async chat(request: ChatRequest): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      })
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream request failed: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }
  }
}
