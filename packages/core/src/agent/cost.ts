import type { Usage } from "../providers/types.js";

/** USD per 1M tokens, matched by substring against the model id. Ordered
 *  longest-key-first at lookup so `gpt-5-mini` never matches `gpt-5`. Prices
 *  move; an unknown model simply reports no cost rather than a wrong one. */
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "claude-haiku": { input: 1, output: 5 },
  "claude-sonnet": { input: 3, output: 15 },
  "claude-opus": { input: 15, output: 75 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "kimi-k2": { input: 0.6, output: 2.5 },
  "moonshot-v1": { input: 1.2, output: 1.2 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "llama-3": { input: 0.2, output: 0.2 },
  qwen: { input: 0.2, output: 0.6 },
};

export function priceFor(model: string): { input: number; output: number } | null {
  const id = model.toLowerCase();
  const key = Object.keys(PRICES)
    .filter((candidate) => id.includes(candidate))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key]! : null;
}

export function estimateCost(model: string, usage: Usage): number {
  const price = priceFor(model);
  if (!price) return 0;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** Rough token count for budgeting when the provider reports no usage.
 *  Four characters per token is close enough to decide when to compact. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
