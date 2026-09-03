import { type Tool } from "./types.js";

export type TodoStatus = "pending" | "in_progress" | "done";
export interface TodoItem {
  text: string;
  status: TodoStatus;
}

/** The plan is state the UI renders, not text buried in the transcript. The
 *  agent loop reads it back out of here after each call. */
export class TodoStore {
  private items: TodoItem[] = [];

  set(items: TodoItem[]): void {
    this.items = items;
  }

  list(): readonly TodoItem[] {
    return this.items;
  }
}

export function todoWriteTool(
  store: TodoStore,
  onChange?: (items: readonly TodoItem[]) => void,
): Tool {
  return {
    name: "todo_write",
    description:
      "Record or update the plan for a multi-step task. Send the full list every time. Keep exactly one item in_progress.",
    mutating: false,
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "done"] },
            },
            required: ["text", "status"],
          },
        },
      },
      required: ["todos"],
    },
    summarize: () => "update plan",
    async run(args) {
      const raw = Array.isArray(args.todos) ? args.todos : [];
      const items: TodoItem[] = raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text : "";
        const status = record.status;
        if (!text) return [];
        return [
          {
            text,
            status:
              status === "in_progress" || status === "done" ? status : ("pending" as TodoStatus),
          },
        ];
      });
      store.set(items);
      onChange?.(items);
      const rendered = items
        .map(
          (item) =>
            `${item.status === "done" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]"} ${item.text}`,
        )
        .join("\n");
      return { output: rendered || "(empty plan)" };
    },
  };
}
