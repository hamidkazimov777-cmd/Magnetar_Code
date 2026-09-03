import React from "react";
import { Markdown } from "../lib/markdown.js";
import { Diff } from "./Diff.js";

export type Entry =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string }
  | { id: number; kind: "notice"; text: string }
  | { id: number; kind: "error"; text: string }
  | {
      id: number;
      kind: "tool";
      name: string;
      summary: string;
      output?: string;
      diff?: string;
      isError?: boolean;
      running: boolean;
    };

/** Omit over a union has to distribute, or every member loses the fields the
 *  others do not share. */
export type NewEntry = Entry extends infer T ? (T extends Entry ? Omit<T, "id"> : never) : never;

interface Props {
  entries: Entry[];
  streaming: string;
}

/** The turn as it happens: what was asked, what the agent said, and every tool
 *  it reached for, with the diff it produced. */
export function Stream({ entries, streaming }: Props): React.ReactElement {
  const bottom = React.useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = React.useState(true);

  React.useEffect(() => {
    if (pinned) bottom.current?.scrollIntoView({ block: "end" });
  }, [entries, streaming, pinned]);

  return (
    <div
      className="stream"
      onScroll={(event) => {
        const el = event.currentTarget;
        // Reading back through the transcript should not be yanked to the
        // bottom by the next token.
        setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
      }}
    >
      {entries.length === 0 && !streaming ? (
        <div className="empty">
          Nothing yet. Ask below, or keep working in the terminal — this view follows along.
        </div>
      ) : null}

      {entries.map((entry) => {
        if (entry.kind === "user")
          return (
            <div key={entry.id} className="turn-user">
              {entry.text}
            </div>
          );
        if (entry.kind === "assistant")
          return (
            <div key={entry.id} className="turn-assistant">
              <Markdown text={entry.text} />
            </div>
          );
        if (entry.kind === "notice")
          return (
            <div key={entry.id} className="notice">
              {entry.text}
            </div>
          );
        if (entry.kind === "error")
          return (
            <div key={entry.id} className="error">
              {entry.text}
            </div>
          );
        return (
          <div key={entry.id} className="tool" data-error={entry.isError ? "true" : "false"}>
            <div className="tool-head">
              <span className="tool-name">{entry.name}</span>
              <span className="tool-arg">{entry.summary}</span>
              {entry.running ? <span className="spacer notice">running…</span> : null}
            </div>
            {entry.diff ? <Diff patch={entry.diff} /> : null}
            {!entry.diff && entry.output ? (
              <div className="tool-body">{entry.output.slice(0, 4000)}</div>
            ) : null}
          </div>
        );
      })}

      {streaming ? (
        <div className="turn-assistant caret">
          <Markdown text={streaming} />
        </div>
      ) : null}
      <div ref={bottom} />
    </div>
  );
}
