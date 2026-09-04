import React from "react";

interface Props {
  request: { id: string; tool: string; summary: string };
  onAnswer: (decision: "allow" | "always" | "deny") => void;
}

/** The same three answers as the terminal, so a habit learned in one place
 *  works in the other. */
export function Approval({ request, onAnswer }: Props): React.ReactElement {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "y") onAnswer("allow");
      if (event.key === "a") onAnswer("always");
      if (event.key === "n" || event.key === "Escape") onAnswer("deny");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer]);

  return (
    <div className="approval">
      <div className="approval-title">
        {request.tool === "run_command" ? "Run this command?" : `Allow ${request.tool}?`}
      </div>
      <div className="approval-target">{request.summary}</div>
      <div className="approval-buttons">
        <button className="btn-allow" onClick={() => onAnswer("allow")}>
          Allow · y
        </button>
        <button className="btn-allow" onClick={() => onAnswer("always")}>
          Always · a
        </button>
        <button className="btn-deny" onClick={() => onAnswer("deny")}>
          Deny · n
        </button>
      </div>
    </div>
  );
}
