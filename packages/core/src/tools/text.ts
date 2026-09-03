/** Shared limits. The prototype read whole files into context — one
 *  package-lock.json was enough to blow the window and the budget. */
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_OUTPUT_CHARS = 30_000;

export function truncate(text: string, limit = MAX_OUTPUT_CHARS): string {
  if (text.length <= limit) return text;
  const kept = text.slice(0, limit);
  const dropped = text.length - limit;
  return `${kept}\n\n[... truncated ${dropped} characters. Narrow the request to see more.]`;
}

/** A NUL byte in the first block is the same heuristic git uses. */
export function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

export function numberLines(text: string, startLine = 1): string {
  return text
    .split("\n")
    .map((line, index) => `${String(startLine + index).padStart(5)}\t${line}`)
    .join("\n");
}

/** A minimal unified diff — enough for a reviewer to see what changed without
 *  pulling in a diff library. Context is fixed at three lines. */
export function unifiedDiff(filePath: string, before: string, after: string): string {
  if (before === after) return "";
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const context = 3;
  const from = Math.max(0, start - context);
  const toA = Math.min(a.length, endA + context);
  const toB = Math.min(b.length, endB + context);

  const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
  lines.push(`@@ -${from + 1},${toA - from} +${from + 1},${toB - from} @@`);
  for (let i = from; i < start; i++) lines.push(` ${a[i]}`);
  for (let i = start; i < endA; i++) lines.push(`-${a[i]}`);
  for (let i = start; i < endB; i++) lines.push(`+${b[i]}`);
  for (let i = endA; i < toA; i++) lines.push(` ${a[i]}`);
  return lines.join("\n");
}
