import React from "react";
import { Box, Static, Text } from "ink";
import { theme } from "../theme.js";
import { renderMarkdown } from "../markdown.js";
import { Banner, type BannerProps } from "./Banner.js";

export type ItemKind = "user" | "assistant" | "tool" | "notice" | "error" | "raw" | "banner";

export interface Item {
  id: string;
  kind: ItemKind;
  text: string;
  /** Tool items carry the name and, when the tool changed a file, its diff. */
  name?: string;
  diff?: string;
  isError?: boolean;
  /** The header is the first static item, so it scrolls away like any other
   *  output instead of being repainted on every frame. */
  banner?: BannerProps;
}

/** Finished items go through Ink's <Static>: they are painted once and never
 *  re-rendered. The prototype re-rendered the whole transcript on every token,
 *  which is why long sessions crawled. */
export function Transcript({ items, width }: { items: Item[]; width: number }): React.ReactElement {
  return (
    <Static items={items}>
      {(item) => (
        <Box key={item.id} flexDirection="column" marginBottom={1}>
          <Line item={item} width={width} />
        </Box>
      )}
    </Static>
  );
}

export function Line({ item, width }: { item: Item; width: number }): React.ReactElement {
  switch (item.kind) {
    case "user":
      return (
        <Text color={theme.user}>
          {"› "}
          {item.text}
        </Text>
      );
    case "assistant":
      return <Text>{renderMarkdown(item.text, width)}</Text>;
    case "tool":
      return (
        <Box flexDirection="column">
          <Text color={item.isError ? theme.err : theme.dim}>
            {item.isError ? "✗" : "·"} <Text color={theme.accentDim}>{item.name}</Text> {item.text}
          </Text>
          {item.diff ? <Diff patch={item.diff} /> : null}
        </Box>
      );
    case "banner":
      return item.banner ? <Banner {...item.banner} /> : <Text />;
    case "notice":
      return <Text color={theme.dim}>· {item.text}</Text>;
    case "error":
      return <Text color={theme.err}>✗ {item.text}</Text>;
    default:
      return <Text>{item.text}</Text>;
  }
}

function Diff({ patch }: { patch: string }): React.ReactElement {
  const lines = patch
    .split("\n")
    .filter((line) => !line.startsWith("---") && !line.startsWith("+++"));
  const shown = lines.slice(0, 24);
  return (
    <Box flexDirection="column" marginLeft={2}>
      {shown.map((line, index) => (
        <Text
          key={index}
          color={line.startsWith("+") ? theme.ok : line.startsWith("-") ? theme.err : theme.dim}
        >
          {line}
        </Text>
      ))}
      {lines.length > shown.length ? (
        <Text color={theme.dim}>… {lines.length - shown.length} more lines</Text>
      ) : null}
    </Box>
  );
}
