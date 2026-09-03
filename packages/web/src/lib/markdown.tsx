import React from "react";

/** A small markdown renderer that builds React elements directly.
 *
 *  Model output is untrusted text. Handing it to a markdown-to-HTML library
 *  and then to dangerouslySetInnerHTML would put script injection one bad
 *  release away; building elements means the browser never parses HTML we did
 *  not write. It covers what a coding agent actually emits: headings, lists,
 *  fenced and inline code, bold, italic, links and quotes. */
export function Markdown({ text }: { text: string }): React.ReactElement {
  return <div className="md">{blocks(text)}</div>;
}

function blocks(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const body: string[] = [];
      index++;
      while (index < lines.length && !lines[index]!.startsWith("```")) {
        body.push(lines[index]!);
        index++;
      }
      index++; // closing fence, or the end of a stream still being written
      out.push(
        <pre key={key++} data-language={language}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length, 3);
      const Tag = `h${level}` as "h1" | "h2" | "h3";
      out.push(<Tag key={key++}>{inline(heading[2]!)}</Tag>);
      index++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index]!)) {
        body.push(lines[index]!.replace(/^\s*>\s?/, ""));
        index++;
      }
      out.push(<blockquote key={key++}>{inline(body.join(" "))}</blockquote>);
      continue;
    }

    const bullet = /^\s*([-*+]|\d+\.)\s+/.exec(line);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]!);
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index]!)) {
        items.push(
          <li key={items.length}>{inline(lines[index]!.replace(/^\s*([-*+]|\d+\.)\s+/, ""))}</li>,
        );
        index++;
      }
      out.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }

    if (line.trim() === "") {
      index++;
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index]!.trim() !== "" &&
      !lines[index]!.startsWith("```") &&
      !/^(#{1,6})\s/.test(lines[index]!) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[index]!) &&
      !/^\s*>\s?/.test(lines[index]!)
    ) {
      paragraph.push(lines[index]!);
      index++;
    }
    out.push(<p key={key++}>{inline(paragraph.join(" "))}</p>);
  }

  return out;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;

export function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index;
    if (start > last) out.push(text.slice(last, start));
    const token = match[0];
    if (token.startsWith("`")) {
      out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
      const href = link[2]!;
      // Only ever link somewhere the browser will not execute.
      const safe = /^https?:\/\//i.test(href) ? href : undefined;
      out.push(
        safe ? (
          <a key={key++} href={safe} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>
        ) : (
          <span key={key++}>{link[1]}</span>
        ),
      );
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
