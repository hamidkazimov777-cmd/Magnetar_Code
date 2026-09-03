import React from "react";

/** A unified diff, coloured. The patch comes from the agent's own tools, so it
 *  is already small and already scoped to one file. */
export function Diff({ patch }: { patch: string }): React.ReactElement {
  const lines = patch.split("\n");
  return (
    <pre className="diff">
      {lines.map((line, index) => (
        <div
          key={index}
          className={
            line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")
              ? "diff-meta"
              : line.startsWith("+")
                ? "diff-add"
                : line.startsWith("-")
                  ? "diff-del"
                  : undefined
          }
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}
