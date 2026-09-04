import React from "react";
import type { TodoItem } from "@magnetar/core";

/** The plan the agent is working to, as it updates it. */
export function Todos({ items }: { items: readonly TodoItem[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <>
      <div className="panel-title">Plan</div>
      {items.map((item, index) => (
        <div
          key={index}
          className="row"
          style={{
            whiteSpace: "normal",
            color:
              item.status === "done"
                ? "var(--faint)"
                : item.status === "in_progress"
                  ? "var(--accent)"
                  : "var(--dim)",
            textDecoration: item.status === "done" ? "line-through" : undefined,
          }}
        >
          {item.status === "done" ? "[x] " : item.status === "in_progress" ? "[>] " : "[ ] "}
          {item.text}
        </div>
      ))}
    </>
  );
}
