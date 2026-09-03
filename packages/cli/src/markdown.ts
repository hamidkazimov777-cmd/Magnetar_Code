import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

/** marked-terminal renders headings, lists, tables and fenced code with
 *  highlighting. A fresh instance per width so a resized terminal re-wraps. */
const cache = new Map<number, Marked>();

function renderer(width: number): Marked {
  let instance = cache.get(width);
  if (!instance) {
    instance = new Marked();
    instance.use(markedTerminal({ width, reflowText: true, tab: 2 }) as never);
    cache.set(width, instance);
  }
  return instance;
}

/** Streaming output is markdown-shaped but arrives half-written; rendering a
 *  partial document is fine, throwing on one is not. */
export function renderMarkdown(text: string, width: number): string {
  const usable = Math.max(20, Math.min(width, 120));
  try {
    const out = renderer(usable).parse(text, { async: false });
    return typeof out === "string" ? out.replace(/\n+$/, "") : text;
  } catch {
    return text;
  }
}
