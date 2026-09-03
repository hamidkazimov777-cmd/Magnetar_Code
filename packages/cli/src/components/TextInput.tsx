import React from "react";
import { Text, useInput } from "ink";
import { theme } from "../theme.js";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  /** ↑/↓ walk the input history when the caret is on the first/last line. */
  history: readonly string[];
  placeholder?: string;
  focus?: boolean;
  /** Consumed by the command palette when it is open. */
  onArrow?: (direction: "up" | "down") => boolean;
  /** Render every character as this one — for API keys. */
  mask?: string;
}

/** Multi-line input with a visible block caret. The prototype's blessed
 *  textbox was one line tall and lost every newline. */
export function TextInput({
  value,
  onChange,
  onSubmit,
  history,
  placeholder = "",
  focus = true,
  onArrow,
  mask,
}: Props): React.ReactElement {
  const [caret, setCaret] = React.useState(value.length);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    setCaret((current) => Math.min(current, value.length));
  }, [value]);

  const set = (next: string, nextCaret: number) => {
    onChange(next);
    setCaret(Math.max(0, Math.min(nextCaret, next.length)));
  };

  useInput(
    (input, key) => {
      if (key.upArrow || key.downArrow) {
        if (onArrow?.(key.upArrow ? "up" : "down")) return;
        const lines = value.slice(0, caret).split("\n");
        const onEdge = key.upArrow ? lines.length === 1 : !value.slice(caret).includes("\n");
        if (!onEdge) {
          // Move between lines of the current draft, keeping the column.
          const column = lines.at(-1)!.length;
          const all = value.split("\n");
          const row = lines.length - 1;
          const target = key.upArrow ? row - 1 : row + 1;
          if (target >= 0 && target < all.length) {
            const before = all.slice(0, target).reduce((n, l) => n + l.length + 1, 0);
            set(value, before + Math.min(column, all[target]!.length));
          }
          return;
        }
        if (history.length === 0) return;
        const next = key.upArrow
          ? historyIndex === null
            ? history.length - 1
            : Math.max(0, historyIndex - 1)
          : historyIndex === null
            ? null
            : historyIndex + 1;
        if (next === null || next >= history.length) {
          setHistoryIndex(null);
          set("", 0);
        } else {
          setHistoryIndex(next);
          set(history[next]!, history[next]!.length);
        }
        return;
      }

      if (key.return) {
        // A trailing backslash, or Option/Alt+Enter, means "another line".
        if (key.meta || value.endsWith("\\")) {
          const trimmed = value.endsWith("\\") ? value.slice(0, -1) : value;
          set(`${trimmed}\n`, trimmed.length + 1);
          return;
        }
        setHistoryIndex(null);
        onSubmit(value);
        return;
      }

      if (key.leftArrow) return setCaret(Math.max(0, caret - 1));
      if (key.rightArrow) return setCaret(Math.min(value.length, caret + 1));
      if (key.ctrl && input === "a") return setCaret(lineStart(value, caret));
      if (key.ctrl && input === "e") return setCaret(lineEnd(value, caret));
      if (key.ctrl && input === "u") return set(value.slice(caret), 0);
      if (key.ctrl && input === "k") return set(value.slice(0, caret), caret);
      if (key.ctrl && input === "w") {
        const before = value.slice(0, caret).replace(/\S*\s*$/, "");
        return set(before + value.slice(caret), before.length);
      }
      if (key.backspace || key.delete) {
        if (caret === 0) return;
        return set(value.slice(0, caret - 1) + value.slice(caret), caret - 1);
      }
      if (key.ctrl || key.escape || key.tab) return;

      if (input) {
        set(value.slice(0, caret) + input + value.slice(caret), caret + input.length);
      }
    },
    { isActive: focus },
  );

  if (!value) {
    return (
      <Text>
        <Text inverse> </Text>
        <Text color={theme.dim}>{placeholder}</Text>
      </Text>
    );
  }

  const shown = mask ? mask.repeat(value.length) : value;
  const before = shown.slice(0, caret);
  const under = shown.slice(caret, caret + 1) || " ";
  const after = shown.slice(caret + 1);
  return (
    <Text color={theme.text}>
      {before}
      <Text inverse>{under}</Text>
      {after}
    </Text>
  );
}

function lineStart(value: string, caret: number): number {
  return value.lastIndexOf("\n", caret - 1) + 1;
}

function lineEnd(value: string, caret: number): number {
  const index = value.indexOf("\n", caret);
  return index === -1 ? value.length : index;
}
