import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface PickerItem {
  label: string;
  hint?: string;
  value: string;
}

interface Props {
  title: string;
  items: PickerItem[];
  onSelect: (value: string) => void;
  onCancel: () => void;
  /** Rows shown at once; the list scrolls around the selection. */
  height?: number;
}

/** One list widget behind /sessions, /model, /permissions and the provider
 *  wizard — the prototype built a new blessed list each time and each one
 *  fought the input box for focus. */
export function Picker({
  title,
  items,
  onSelect,
  onCancel,
  height = 10,
}: Props): React.ReactElement {
  const [index, setIndex] = React.useState(0);
  const [query, setQuery] = React.useState("");

  const filtered = query
    ? items.filter((item) =>
        `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      )
    : items;
  const selected = Math.min(index, Math.max(0, filtered.length - 1));

  useInput((input, key) => {
    if (key.escape) return onCancel();
    if (key.return) {
      const item = filtered[selected];
      if (item) onSelect(item.value);
      return;
    }
    if (key.upArrow) return setIndex(selected === 0 ? filtered.length - 1 : selected - 1);
    if (key.downArrow) return setIndex(selected >= filtered.length - 1 ? 0 : selected + 1);
    if (key.backspace || key.delete) {
      setIndex(0);
      return setQuery(query.slice(0, -1));
    }
    if (input && !key.ctrl && !key.meta) {
      setIndex(0);
      setQuery(query + input);
    }
  });

  const start = Math.max(0, Math.min(selected - Math.floor(height / 2), filtered.length - height));
  const window = filtered.slice(start, start + height);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={theme.accent} paddingX={1}>
      <Text color={theme.accent} bold>
        {title}
        {query ? <Text color={theme.dim}> · {query}</Text> : null}
      </Text>
      {window.length === 0 ? (
        <Text color={theme.dim}>no matches</Text>
      ) : (
        window.map((item, offset) => {
          const active = start + offset === selected;
          return (
            <Text key={item.value} color={active ? theme.accent : theme.text}>
              {active ? "▶ " : "  "}
              {item.label}
              {item.hint ? <Text color={theme.dim}> {item.hint}</Text> : null}
            </Text>
          );
        })
      )}
      <Text color={theme.dim}>↑↓ move · type to filter · enter select · esc cancel</Text>
    </Box>
  );
}
