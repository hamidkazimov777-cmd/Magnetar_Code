import { formatCost, runAgent, type AgentEvent } from "@magnetar/core";
import type { ParsedArgs } from "./args.js";
import { createRuntime } from "./runtime.js";

/** Read piped input so `cat error.log | magnetar -p "why"` works.
 *
 *  A non-TTY stdin is not proof that anything is coming: launched from a CI
 *  step or a task runner, fd 0 is often an open pipe nobody ever writes to,
 *  and reading it to EOF would hang forever. So we wait briefly for the first
 *  byte and give up if none arrives. */
export async function readStdin(timeoutMs = 500): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  const first = await new Promise<Buffer | null>((resolve) => {
    const timer = setTimeout(() => {
      process.stdin.off("readable", onReadable);
      resolve(null);
    }, timeoutMs);
    const onReadable = () => {
      const chunk = process.stdin.read() as Buffer | null;
      if (chunk === null && !process.stdin.readableEnded) return;
      clearTimeout(timer);
      process.stdin.off("readable", onReadable);
      resolve(chunk);
    };
    process.stdin.on("readable", onReadable);
    process.stdin.once("end", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  if (first === null) return "";
  chunks.push(first);
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

/** One prompt, one answer, exit code says whether it worked. Everything that
 *  is not the answer goes to stderr, so the answer can be piped. */
export async function runHeadless(args: ParsedArgs, prompt: string): Promise<number> {
  const runtime = await createRuntime(args);
  const json = args.outputFormat === "json";

  let answer = "";
  const toolCalls: { name: string; summary: string; isError: boolean }[] = [];
  const pending = new Map<string, string>();

  const onEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "delta":
        answer += event.text;
        if (!json) process.stdout.write(event.text);
        break;
      case "tool_start":
        pending.set(event.id, event.summary);
        if (!json) process.stderr.write(`· ${event.name} ${event.summary}\n`);
        break;
      case "tool_end":
        toolCalls.push({
          name: event.name,
          summary: pending.get(event.id) ?? "",
          isError: event.result.isError ?? false,
        });
        break;
      case "notice":
        process.stderr.write(`· ${event.text}\n`);
        break;
      default:
        break;
    }
  };

  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.on("SIGINT", onSignal);

  const result = await runAgent(prompt, {
    provider: runtime.provider,
    model: runtime.model,
    tools: runtime.tools,
    permissions: runtime.permissions,
    session: runtime.session,
    cwd: runtime.cwd,
    systemPrompt: runtime.systemPrompt,
    maxSteps: args.maxSteps,
    maxCostUsd: args.maxCostUsd,
    signal: controller.signal,
    onEvent,
    // Nobody is at the keyboard. Denying is the only safe answer, and the
    // model is told why so it can suggest the flag instead of retrying.
    requestApproval: async ({ tool, summary }) => {
      process.stderr.write(
        `· refused ${tool.name} (${summary}) — non-interactive runs need --permission-mode auto-edit or yolo\n`,
      );
      return "deny";
    },
  });

  process.off("SIGINT", onSignal);

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          result: answer,
          sessionId: runtime.session.meta.id,
          model: runtime.model,
          stopReason: result.stopReason,
          steps: result.steps,
          usage: result.usage,
          costUsd: Number(result.costUsd.toFixed(6)),
          toolCalls,
          ...(result.error ? { error: result.error.message } : {}),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write("\n");
    if (result.costUsd > 0) {
      process.stderr.write(`· ${result.steps} steps · ${formatCost(result.costUsd)}\n`);
    }
    if (result.error) process.stderr.write(`· error: ${result.error.message}\n`);
  }

  return result.stopReason === "done" ? 0 : 1;
}
