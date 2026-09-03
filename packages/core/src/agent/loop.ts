import type { OpenAICompatibleProvider } from "../providers/openai.js";
import type { Message, ToolCall, Usage } from "../providers/types.js";
import { toSchema, type Tool, type ToolResult } from "../tools/types.js";
import { SandboxError } from "../tools/sandbox.js";
import type { Permissions, Approval } from "../permissions/permissions.js";
import type { Session } from "../session/session.js";
import { estimateCost } from "./cost.js";
import { compact, shouldCompact } from "./compact.js";

export type AgentEvent =
  | { type: "step"; step: number; maxSteps: number }
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "assistant"; text: string }
  | { type: "tool_start"; id: string; name: string; summary: string }
  | { type: "tool_end"; id: string; name: string; result: ToolResult }
  | { type: "usage"; usage: Usage; costUsd: number }
  | { type: "compacted"; before: number; after: number }
  | { type: "notice"; text: string };

export interface ApprovalRequest {
  tool: Tool;
  args: Record<string, unknown>;
  summary: string;
}

export type StopReason = "done" | "max_steps" | "cancelled" | "budget" | "error";

export interface AgentResult {
  stopReason: StopReason;
  steps: number;
  costUsd: number;
  usage: Usage;
  error?: Error;
}

export interface AgentOptions {
  provider: OpenAICompatibleProvider;
  model: string;
  tools: Tool[];
  permissions: Permissions;
  session: Session;
  cwd: string;
  systemPrompt: string;
  /** Hard stop on runaway tool loops. The prototype had none: a model that
   *  kept calling tools recursed until the process or the wallet gave out. */
  maxSteps?: number;
  /** Stop once this much has been spent on this run. 0 disables the check. */
  maxCostUsd?: number;
  temperature?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  /** Asked before a mutating tool runs, unless permissions already allow it. */
  requestApproval?: (request: ApprovalRequest) => Promise<Approval>;
}

const DEFAULT_MAX_STEPS = 25;

export async function runAgent(userInput: string, options: AgentOptions): Promise<AgentResult> {
  const {
    provider,
    model,
    tools,
    permissions,
    session,
    cwd,
    systemPrompt,
    signal,
    onEvent = () => {},
    requestApproval,
  } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxCostUsd = options.maxCostUsd ?? 0;
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const schemas = tools.map(toSchema);

  const total: Usage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let steps = 0;

  await session.append({ role: "user", content: userInput });

  try {
    for (steps = 1; steps <= maxSteps; steps++) {
      if (signal?.aborted) return result("cancelled");
      onEvent({ type: "step", step: steps, maxSteps });

      if (shouldCompact(session.history())) {
        const before = session.history().length;
        const compacted = await compact([...session.history()], provider, model, signal);
        if (compacted.length < before) {
          await session.replaceHistory(compacted);
          onEvent({ type: "compacted", before, after: compacted.length });
        }
      }

      const messages: Message[] = [{ role: "system", content: systemPrompt }, ...session.history()];

      let text = "";
      let calls: ToolCall[] = [];
      for await (const event of provider.stream({
        model,
        messages,
        tools: schemas,
        temperature: options.temperature,
        signal,
      })) {
        switch (event.type) {
          case "delta":
            text += event.text;
            onEvent({ type: "delta", text: event.text });
            break;
          case "reasoning":
            onEvent({ type: "reasoning", text: event.text });
            break;
          case "tool_call":
            calls = event.calls;
            break;
          case "usage": {
            total.inputTokens += event.usage.inputTokens;
            total.outputTokens += event.usage.outputTokens;
            const stepCost = estimateCost(model, event.usage);
            costUsd += stepCost;
            await session.addCost(stepCost);
            onEvent({ type: "usage", usage: event.usage, costUsd });
            break;
          }
          case "done":
            break;
        }
      }

      if (text) onEvent({ type: "assistant", text });
      await session.append({
        role: "assistant",
        content: text || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      });

      if (calls.length === 0) return result("done");

      for (const call of calls) {
        if (signal?.aborted) {
          // The assistant turn already claims these calls, so every one of them
          // needs an answer or the next request is malformed.
          await session.append(toolMessage(call, "Cancelled by the user."));
          continue;
        }
        const outcome = await runToolCall(call);
        await session.append(toolMessage(call, outcome.output));
      }

      if (maxCostUsd > 0 && costUsd >= maxCostUsd) {
        onEvent({
          type: "notice",
          text: `Stopped: this run reached the ${maxCostUsd} USD budget.`,
        });
        return result("budget");
      }
      if (signal?.aborted) return result("cancelled");
    }

    steps = maxSteps;
    onEvent({
      type: "notice",
      text: `Stopped after ${maxSteps} steps without finishing. Ask again to continue, or narrow the task.`,
    });
    return result("max_steps");
  } catch (error) {
    if (signal?.aborted) return result("cancelled");
    return { ...result("error"), error: error as Error };
  }

  function result(stopReason: StopReason): AgentResult {
    return { stopReason, steps, costUsd, usage: total };
  }

  async function runToolCall(call: ToolCall): Promise<ToolResult> {
    const tool = byName.get(call.function.name);
    if (!tool) {
      const known = [...byName.keys()].join(", ");
      return fail(call, `Unknown tool "${call.function.name}". Available tools: ${known}.`);
    }

    let args: Record<string, unknown>;
    try {
      args = call.function.arguments
        ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
        : {};
    } catch {
      // Models truncate or malform JSON often enough that this must be a
      // recoverable message rather than a crash.
      return fail(
        call,
        "Your tool arguments were not valid JSON. Send them again as a single JSON object.",
      );
    }

    const summary = safeSummary(tool, args);
    onEvent({ type: "tool_start", id: call.id, name: tool.name, summary });

    if (permissions.check(tool, args) === "ask") {
      const approval = requestApproval
        ? await requestApproval({ tool, args, summary })
        : ("deny" as Approval);
      if (approval === "always") await permissions.remember(tool, args);
      if (approval === "deny") {
        return fail(
          call,
          "The user denied this action. Do not retry it. Explain why you needed it, or propose another way.",
        );
      }
    }

    try {
      const result = await tool.run(args, {
        cwd,
        signal,
        onProgress: (text) => onEvent({ type: "notice", text }),
      });
      onEvent({ type: "tool_end", id: call.id, name: tool.name, result });
      return result;
    } catch (error) {
      const message =
        error instanceof SandboxError
          ? error.message
          : `${tool.name} failed: ${(error as Error).message}`;
      return fail(call, message);
    }
  }

  function fail(call: ToolCall, output: string): ToolResult {
    const result: ToolResult = { output, isError: true };
    onEvent({ type: "tool_end", id: call.id, name: call.function.name, result });
    return result;
  }
}

function safeSummary(tool: Tool, args: Record<string, unknown>): string {
  try {
    return tool.summarize(args);
  } catch {
    return tool.name;
  }
}

function toolMessage(call: ToolCall, content: string): Message {
  return { role: "tool", tool_call_id: call.id, name: call.function.name, content };
}
