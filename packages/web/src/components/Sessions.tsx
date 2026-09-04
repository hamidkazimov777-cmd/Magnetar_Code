import React from "react";
import type { SessionMeta } from "@magnetar/core";

interface Props {
  sessions: SessionMeta[];
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

/** The same sessions the terminal sees — one store, two windows onto it. */
export function Sessions({
  sessions,
  activeId,
  onOpen,
  onNew,
  onDelete,
}: Props): React.ReactElement {
  return (
    <>
      <div className="panel-title">SESSIONS</div>
      <div style={{ padding: "0 8px 8px" }}>
        <button style={{ width: "100%" }} onClick={onNew}>
          + new
        </button>
      </div>
      {sessions.map((session) => (
        <div key={session.id} className="row-wrap">
          <button
            className="row"
            data-active={session.id === activeId ? "true" : "false"}
            onClick={() => onOpen(session.id)}
            title={session.title}
          >
            {session.title}
            <small>
              {new Date(session.updatedAt).toLocaleString()} · {session.messageCount} msg
            </small>
          </button>
          <button
            className="row-delete"
            title="delete session"
            onClick={() => {
              if (confirm(`Delete "${session.title}"?`)) onDelete(session.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}
