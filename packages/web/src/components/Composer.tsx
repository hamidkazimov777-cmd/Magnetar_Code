import React from "react";
import { COMMANDS, filterCommands } from "@magnetar/core/commands";
import { api } from "../lib/client.js";

interface Props {
  busy: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  onCommand: (name: string, argument: string) => void;
}

type Suggestion = { value: string; label: string; hint?: string };

/** The composer speaks the same two languages as the terminal: "/" opens the
 *  command palette, "@" completes a path from the project. The command list
 *  comes from core, so the two surfaces cannot drift apart. */
export function Composer({ busy, onSend, onCancel, onCommand }: Props): React.ReactElement {
  const [draft, setDraft] = React.useState("");
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const [index, setIndex] = React.useState(0);
  const [dropping, setDropping] = React.useState(false);
  const box = React.useRef<HTMLTextAreaElement>(null);

  // The token under the caret decides what, if anything, we are completing.
  const token = React.useMemo(() => {
    const word = draft.split(/\s/).pop() ?? "";
    if (draft.startsWith("/") && !draft.includes(" "))
      return { kind: "slash" as const, word: draft };
    if (word.startsWith("@")) return { kind: "at" as const, word: word.slice(1) };
    return null;
  }, [draft]);

  React.useEffect(() => {
    let cancelled = false;
    if (!token) {
      setItems([]);
      return;
    }
    if (token.kind === "slash") {
      setItems(
        filterCommands(token.word).map((command) => ({
          value: command.name,
          label: command.name,
          hint: command.description,
        })),
      );
      setIndex(0);
      return;
    }
    const dir = token.word.includes("/") ? token.word.slice(0, token.word.lastIndexOf("/")) : ".";
    void api
      .files(dir || ".")
      .then((entries) => {
        if (cancelled) return;
        setItems(
          entries
            .filter((entry) => entry.path.toLowerCase().includes(token.word.toLowerCase()))
            .slice(0, 8)
            .map((entry) => ({
              value: `@${entry.path}${entry.directory ? "/" : ""}`,
              label: entry.path + (entry.directory ? "/" : ""),
            })),
        );
        setIndex(0);
      })
      .catch(() => setItems([]));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = (value: string) => {
    if (value.startsWith("/")) {
      setDraft("");
      setItems([]);
      const [name = value, ...rest] = value.split(" ");
      onCommand(name, rest.join(" "));
      return;
    }
    const words = draft.split(/(\s)/);
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i]!.startsWith("@")) {
        words[i] = `${value} `;
        break;
      }
    }
    setDraft(words.join(""));
    setItems([]);
    box.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (text.startsWith("/")) {
      const [name = text, ...rest] = text.split(" ");
      const known = COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
      if (known) {
        setDraft("");
        onCommand(known.name, rest.join(" "));
        return;
      }
    }
    setDraft("");
    onSend(text);
  };

  /** Dropped files are read here and appended as text: the agent's tools are
   *  sandboxed to the project, so a path from the user's Desktop would be
   *  refused if we passed it through. */
  const attach = async (files: FileList | null) => {
    if (!files) return;
    const parts: string[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > 256 * 1024) {
        parts.push(`[${file.name} is too large to attach]`);
        continue;
      }
      const text = await file.text().catch(() => null);
      parts.push(
        text === null
          ? `[${file.name} is not a text file]`
          : `Attached ${file.name}:\n\n\`\`\`\n${text}\n\`\`\``,
      );
    }
    setDraft((current) => [current, ...parts].filter(Boolean).join("\n\n"));
    box.current?.focus();
  };

  return (
    <div
      className="composer"
      data-dropping={dropping ? "true" : "false"}
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        void attach(event.dataTransfer.files);
      }}
    >
      {items.length > 0 ? (
        <div className="suggestions">
          {items.map((item, position) => (
            <button
              key={item.value}
              className="row"
              data-active={position === index ? "true" : "false"}
              onMouseEnter={() => setIndex(position)}
              onClick={() => accept(item.value)}
            >
              {item.label}
              {item.hint ? <small>{item.hint}</small> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="composer-box">
        <label className="clip" title="attach a file">
          <input
            type="file"
            multiple
            onChange={(event) => void attach(event.target.files)}
            style={{ display: "none" }}
          />
          +
        </label>

        <textarea
          ref={box}
          value={draft}
          placeholder={busy ? "working…" : "ask, / for commands, @ for a file"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (items.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                return setIndex((current) => (current + 1) % items.length);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                return setIndex((current) => (current - 1 + items.length) % items.length);
              }
              if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                event.preventDefault();
                return accept(items[index]!.value);
              }
              if (event.key === "Escape") return setItems([]);
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button className="send" onClick={onCancel}>
            Stop
          </button>
        ) : (
          <button className="send" onClick={submit} disabled={!draft.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
